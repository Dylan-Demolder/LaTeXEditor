//! Streaming variant of `call_ai`.
//!
//! The blocking `call_ai` in `settings.rs` stays — Settings → Test Connection
//! wants a single result. This module adds token-by-token delivery over a Tauri
//! channel so long generations don't look frozen.

use crate::app_config;
use crate::commands::settings::AiCallRequest;
use futures::StreamExt;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;

/// Set by `cancel_ai`, polled between chunks.
///
/// ponytail: a single flag means one in-flight AI call at a time, which matches
/// a panel with one Run button. If concurrent skills are ever needed, key these
/// by request id in a Mutex<HashMap<String, Arc<AtomicBool>>>.
#[derive(Default)]
pub struct AiCancel(pub Arc<AtomicBool>);

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    Chunk { text: String },
    /// Reasoning-model "thinking" tokens. Shown as progress but never written
    /// into the document — they are not part of the answer.
    Reasoning { text: String },
    Done { cancelled: bool },
    Error { message: String },
}

/// The two response shapes we have to parse. Provider choice picks one.
#[derive(Clone, Copy, PartialEq)]
enum Wire {
    OpenAi,
    Anthropic,
}

struct Endpoint {
    url: String,
    wire: Wire,
    bearer: Option<String>,
    api_key_header: Option<String>,
    extra_headers: Vec<(&'static str, String)>,
}

fn resolve_endpoint(provider: &str, model: &str, key: Option<String>) -> Result<Endpoint, String> {
    let need = |k: Option<String>| k.filter(|s| !s.is_empty()).ok_or_else(|| {
        format!("No API key configured for {}. Add one in Settings.", provider)
    });

    let openai_like = |url: &str, key: Option<String>| -> Result<Endpoint, String> {
        Ok(Endpoint {
            url: url.to_string(),
            wire: Wire::OpenAi,
            bearer: key,
            api_key_header: None,
            extra_headers: vec![],
        })
    };

    match provider {
        "openai" => openai_like("https://api.openai.com/v1/chat/completions", Some(need(key)?)),
        "deepseek" => openai_like("https://api.deepseek.com/v1/chat/completions", Some(need(key)?)),
        "grok" => openai_like("https://api.x.ai/v1/chat/completions", Some(need(key)?)),
        // Ollama runs locally and takes no key.
        "ollama" => openai_like("http://localhost:11434/v1/chat/completions", None),
        "openrouter" => Ok(Endpoint {
            url: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            wire: Wire::OpenAi,
            bearer: Some(need(key)?),
            api_key_header: None,
            extra_headers: vec![
                ("HTTP-Referer", "https://latexeditor.app".to_string()),
                ("X-Title", "LaTeXEditor".to_string()),
            ],
        }),
        "anthropic" => Ok(Endpoint {
            url: "https://api.anthropic.com/v1/messages".to_string(),
            wire: Wire::Anthropic,
            bearer: None,
            api_key_header: Some(need(key)?),
            extra_headers: vec![("anthropic-version", "2023-06-01".to_string())],
        }),
        // OpenCode Go proxies both shapes; the model name picks which.
        "opencode-go" => {
            let k = need(key)?;
            if model.starts_with("minimax-") || model.starts_with("qwen") {
                Ok(Endpoint {
                    url: "https://opencode.ai/zen/go/v1/messages".to_string(),
                    wire: Wire::Anthropic,
                    bearer: None,
                    api_key_header: Some(k),
                    extra_headers: vec![("anthropic-version", "2023-06-01".to_string())],
                })
            } else {
                openai_like("https://opencode.ai/zen/go/v1/chat/completions", Some(k))
            }
        }
        other => Err(format!("Unknown provider: {}", other)),
    }
}

fn build_body(req: &AiCallRequest, wire: Wire, reduce_reasoning: bool) -> serde_json::Value {
    match wire {
        Wire::Anthropic => serde_json::json!({
            "model": req.model,
            "max_tokens": req.max_tokens,
            "system": req.system_prompt,
            "messages": [{"role": "user", "content": req.user_prompt}],
            "stream": true,
        }),
        Wire::OpenAi => {
            let mut body = serde_json::json!({
                "model": req.model,
                "messages": [
                    {"role": "system", "content": req.system_prompt},
                    {"role": "user", "content": req.user_prompt}
                ],
                "temperature": req.temperature,
                "max_tokens": req.max_tokens,
                "stream": true,
            });
            // OpenAI reasoning models reject temperature and rename the cap.
            if req.model.starts_with("o3") || req.model.starts_with("o4") {
                let obj = body.as_object_mut().unwrap();
                obj.remove("temperature");
                obj.remove("max_tokens");
                obj.insert(
                    "max_completion_tokens".to_string(),
                    serde_json::json!(req.max_tokens),
                );
            }
            // Measured on opencode-go: `thinking: disabled` cuts a small
            // proofread from 7.0s to 1.3s with an identical edit, while
            // `reasoning_effort: "low"` is ignored. Only sent to providers
            // verified to accept it — OpenAI proper rejects unknown fields.
            // ponytail: extend this list only after measuring the provider.
            if reduce_reasoning && req.provider == "opencode-go" {
                body.as_object_mut().unwrap().insert(
                    "thinking".to_string(),
                    serde_json::json!({ "type": "disabled" }),
                );
            }
            body
        }
    }
}

/// Pull the incremental answer text out of one decoded SSE `data:` payload.
/// `None` means "no answer text here" (pings, metadata, reasoning, stop markers).
fn extract_delta(json: &serde_json::Value, wire: Wire) -> Option<String> {
    let text = match wire {
        Wire::OpenAi => json["choices"][0]["delta"]["content"].as_str()?,
        Wire::Anthropic => {
            if json["type"].as_str()? != "content_block_delta" {
                return None;
            }
            json["delta"]["text"].as_str()?
        }
    };
    (!text.is_empty()).then(|| text.to_string())
}

/// Reasoning models (deepseek-v4-pro, o-series, …) stream their chain of
/// thought in a separate field with `content: null`. Reading only `content`
/// makes such a model look completely silent — and if its budget runs out
/// mid-thought, no answer is ever produced.
fn extract_reasoning(json: &serde_json::Value, wire: Wire) -> Option<String> {
    if wire != Wire::OpenAi {
        return None;
    }
    let delta = &json["choices"][0]["delta"];
    let text = delta["reasoning_content"]
        .as_str()
        .or_else(|| delta["reasoning"].as_str())?;
    (!text.is_empty()).then(|| text.to_string())
}

/// Why the provider stopped, when it says so.
fn extract_finish_reason(json: &serde_json::Value, wire: Wire) -> Option<String> {
    match wire {
        Wire::OpenAi => json["choices"][0]["finish_reason"].as_str().map(str::to_string),
        Wire::Anthropic => json["delta"]["stop_reason"].as_str().map(str::to_string),
    }
}

/// Incremental SSE decoder.
///
/// Network chunks split wherever TCP feels like it — routinely mid-line and
/// mid-JSON — so bytes are buffered until a newline completes a frame. Kept
/// separate from the request loop so it can be tested without a network call.
#[derive(Default)]
struct SseDecoder {
    buffer: String,
}

enum Frame {
    Text(String),
    Reasoning(String),
    Finish(String),
    Done,
}

impl SseDecoder {
    /// Feed raw bytes; returns whatever complete frames they completed.
    fn push(&mut self, bytes: &[u8], wire: Wire) -> Vec<Frame> {
        self.buffer.push_str(&String::from_utf8_lossy(bytes));
        let mut out = Vec::new();

        while let Some(idx) = self.buffer.find('\n') {
            let line = self.buffer[..idx].trim().to_string();
            self.buffer.drain(..=idx);

            // "event:" lines and blank separators carry no payload.
            let Some(payload) = line.strip_prefix("data:") else {
                continue;
            };
            let payload = payload.trim();
            if payload == "[DONE]" {
                out.push(Frame::Done);
                return out;
            }
            let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) else {
                continue;
            };
            if let Some(text) = extract_delta(&json, wire) {
                out.push(Frame::Text(text));
            }
            if let Some(text) = extract_reasoning(&json, wire) {
                out.push(Frame::Reasoning(text));
            }
            if let Some(reason) = extract_finish_reason(&json, wire) {
                out.push(Frame::Finish(reason));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(decoder: &mut SseDecoder, bytes: &str, wire: Wire) -> (String, bool) {
        let mut text = String::new();
        let mut done = false;
        for frame in decoder.push(bytes.as_bytes(), wire) {
            match frame {
                Frame::Text(t) => text.push_str(&t),
                Frame::Done => done = true,
                Frame::Reasoning(_) | Frame::Finish(_) => {}
            }
        }
        (text, done)
    }

    #[test]
    fn openai_frames_decode_to_text() {
        let mut d = SseDecoder::default();
        let (text, done) = collect(
            &mut d,
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\
             data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\
             data: [DONE]\n",
            Wire::OpenAi,
        );
        assert_eq!(text, "Hello world");
        assert!(done);
    }

    #[test]
    fn anthropic_only_takes_content_block_delta() {
        let mut d = SseDecoder::default();
        let (text, _) = collect(
            &mut d,
            "event: message_start\n\
             data: {\"type\":\"message_start\",\"message\":{}}\n\
             event: content_block_delta\n\
             data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\
             data: {\"type\":\"message_stop\"}\n",
            Wire::Anthropic,
        );
        assert_eq!(text, "Hi", "metadata events must not contribute text");
    }

    /// The one that actually bites: TCP splits wherever it likes, including
    /// mid-JSON. A frame must only be emitted once its newline arrives.
    #[test]
    fn frames_split_across_chunks_are_reassembled() {
        let mut d = SseDecoder::default();
        let (a, _) = collect(&mut d, "data: {\"choices\":[{\"delta\":{\"con", Wire::OpenAi);
        assert_eq!(a, "", "partial JSON must not emit");
        let (b, _) = collect(&mut d, "tent\":\"split\"}}]}\n", Wire::OpenAi);
        assert_eq!(b, "split");
    }

    #[test]
    fn split_between_chunks_at_newline_boundary() {
        let mut d = SseDecoder::default();
        let (a, _) = collect(&mut d, "data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}", Wire::OpenAi);
        assert_eq!(a, "", "a line without its newline is incomplete");
        let (b, _) = collect(&mut d, "\n", Wire::OpenAi);
        assert_eq!(b, "x");
    }

    #[test]
    fn malformed_and_empty_frames_are_skipped_not_fatal() {
        let mut d = SseDecoder::default();
        let (text, _) = collect(
            &mut d,
            "\n: comment\ndata: not json\n\
             data: {\"choices\":[{\"delta\":{}}]}\n\
             data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\
             data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n",
            Wire::OpenAi,
        );
        assert_eq!(text, "ok");
    }

    /// Regression for the bug a live reasoning model exposed: every delta had
    /// `content: null` with the text in `reasoning_content`, so the decoder
    /// produced nothing and the panel reported empty success.
    #[test]
    fn reasoning_deltas_are_captured_separately_from_the_answer() {
        let mut d = SseDecoder::default();
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":null,\"reasoning_content\":\"thinking\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n",
            "data: {\"choices\":[{\"finish_reason\":\"length\",\"delta\":{\"content\":\"\"}}]}\n",
        );
        let (mut answer, mut reasoning, mut finish) = (String::new(), String::new(), None);
        for f in d.push(raw.as_bytes(), Wire::OpenAi) {
            match f {
                Frame::Text(t) => answer.push_str(&t),
                Frame::Reasoning(t) => reasoning.push_str(&t),
                Frame::Finish(r) => finish = Some(r),
                Frame::Done => {}
            }
        }
        assert_eq!(reasoning, "thinking", "reasoning must be surfaced, not dropped");
        assert_eq!(answer, "answer", "reasoning must not contaminate the answer");
        assert_eq!(finish.as_deref(), Some("length"));
    }

    #[test]
    fn openai_reasoning_models_drop_temperature() {
        let req = AiCallRequest {
            provider: "openai".into(),
            model: "o3".into(),
            system_prompt: "s".into(),
            user_prompt: "u".into(),
            temperature: 0.7,
            max_tokens: 100,
        };
        let body = build_body(&req, Wire::OpenAi, false);
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["max_completion_tokens"], 100);
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn anthropic_body_uses_system_field_and_no_temperature() {
        let req = AiCallRequest {
            provider: "anthropic".into(),
            model: "claude-opus-4-8".into(),
            system_prompt: "s".into(),
            user_prompt: "u".into(),
            temperature: 0.7,
            max_tokens: 100,
        };
        let body = build_body(&req, Wire::Anthropic, false);
        assert_eq!(body["system"], "s");
        // Current Claude models reject temperature outright.
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn opencode_go_picks_wire_format_by_model() {
        let key = Some("k".to_string());
        assert!(matches!(
            resolve_endpoint("opencode-go", "qwen3.7-max", key.clone()).unwrap().wire,
            Wire::Anthropic
        ));
        assert!(matches!(
            resolve_endpoint("opencode-go", "glm-5.2", key.clone()).unwrap().wire,
            Wire::OpenAi
        ));
    }

    /// Replays a captured provider response through the decoder in realistic
    /// 64-byte network chunks. The unit tests above use hand-written frames —
    /// this is the one that proves the parser matches what the wire actually
    /// carries. Run after `sse_capture.check.sh`:
    ///     cargo test --lib -- --ignored real_sse
    #[test]
    #[ignore = "needs a captured stream; see sse_capture.check.sh"]
    fn real_sse_capture_decodes_to_nonempty_text() {
        let path = std::env::var("SSE_CAPTURE").unwrap_or_else(|_| "/tmp/opencode-sse.txt".into());
        let raw = std::fs::read(&path)
            .unwrap_or_else(|e| panic!("no capture at {path}: {e} — run sse_capture.check.sh first"));

        assert!(!raw.is_empty(), "capture is empty — the request probably failed");

        let mut decoder = SseDecoder::default();
        let mut text = String::new();
        let mut saw_done = false;

        // Chunk it the way the network would, including splits mid-frame.
        for piece in raw.chunks(64) {
            for frame in decoder.push(piece, Wire::OpenAi) {
                match frame {
                    Frame::Text(t) => text.push_str(&t),
                    Frame::Done => saw_done = true,
                    Frame::Reasoning(_) | Frame::Finish(_) => {}
                }
            }
        }

        println!("decoded {} chars, [DONE] seen: {saw_done}\n---\n{text}\n---", text.len());
        assert!(
            !text.trim().is_empty(),
            "decoder produced no text from a real response — the delta path is wrong \
             for this provider. First 400 bytes of the capture:\n{}",
            String::from_utf8_lossy(&raw[..raw.len().min(400)])
        );
    }

    #[test]
    fn missing_key_is_reported_except_for_local_ollama() {
        assert!(resolve_endpoint("openai", "gpt-4o", None).is_err());
        assert!(resolve_endpoint("openai", "gpt-4o", Some(String::new())).is_err());
        assert!(resolve_endpoint("ollama", "llama3.3", None).is_ok());
        assert!(resolve_endpoint("nope", "m", Some("k".into())).is_err());
    }
}

#[tauri::command]
pub async fn cancel_ai(cancel: tauri::State<'_, AiCancel>) -> Result<(), String> {
    cancel.0.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn call_ai_stream(
    cancel: tauri::State<'_, AiCancel>,
    request: AiCallRequest,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    let flag = cancel.0.clone();
    flag.store(false, Ordering::Relaxed);

    let settings = app_config::load_settings().await?;
    let key = settings.api_keys.get(&request.provider).cloned();
    let endpoint = resolve_endpoint(&request.provider, &request.model, key)?;

    let client = reqwest::Client::new();
    let mut builder = client
        .post(&endpoint.url)
        .json(&build_body(&request, endpoint.wire, settings.reduce_reasoning));

    if let Some(bearer) = &endpoint.bearer {
        builder = builder.header("Authorization", format!("Bearer {}", bearer));
    }
    if let Some(k) = &endpoint.api_key_header {
        builder = builder.header("x-api-key", k);
    }
    for (name, value) in &endpoint.extra_headers {
        builder = builder.header(*name, value);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        // Error responses are regular JSON, not SSE — read the whole body so the
        // user sees the provider's actual complaint rather than a bare status.
        let body = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|j| j["error"]["message"].as_str().map(str::to_string))
            .unwrap_or_else(|| body.chars().take(500).collect());
        return Err(format!("API error ({}): {}", status, message));
    }

    let mut stream = response.bytes_stream();
    let mut decoder = SseDecoder::default();
    let mut cancelled = false;
    let mut content_chars = 0usize;
    let mut reasoning_chars = 0usize;
    let mut finish_reason: Option<String> = None;

    'outer: while let Some(chunk) = stream.next().await {
        if flag.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }

        let bytes = chunk.map_err(|e| format!("Stream error: {}", e))?;
        for frame in decoder.push(&bytes, endpoint.wire) {
            match frame {
                Frame::Text(text) => {
                    content_chars += text.len();
                    on_event
                        .send(StreamEvent::Chunk { text })
                        .map_err(|e| format!("Failed to deliver chunk: {}", e))?;
                }
                Frame::Reasoning(text) => {
                    reasoning_chars += text.len();
                    on_event
                        .send(StreamEvent::Reasoning { text })
                        .map_err(|e| format!("Failed to deliver reasoning: {}", e))?;
                }
                Frame::Finish(reason) => finish_reason = Some(reason),
                Frame::Done => break 'outer,
            }
        }
    }

    // A stream that returns HTTP 200 and no answer used to look like success
    // with an empty result. Say what actually happened instead.
    if !cancelled && content_chars == 0 {
        let message = if finish_reason.as_deref() == Some("length") && reasoning_chars > 0 {
            format!(
                "{} spent its entire output budget on reasoning and produced no answer.                  Raise Max Tokens in Settings (reasoning models need far more), or pick a                  non-reasoning model.",
                request.model
            )
        } else if reasoning_chars > 0 {
            format!("{} returned only reasoning and no answer.", request.model)
        } else if finish_reason.as_deref() == Some("length") {
            format!("{} hit the output limit before producing anything. Raise Max Tokens.", request.model)
        } else {
            format!("{} returned an empty response.", request.model)
        };
        return Err(message);
    }

    on_event
        .send(StreamEvent::Done { cancelled })
        .map_err(|e| format!("Failed to deliver completion: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod live {
    use super::*;
    use futures::StreamExt;

    /// Run the guide's own prose through the Proofread skill, with the same
    /// context the panel attaches. This is the tool editing its own manual.
    ///     cargo test --lib -- --ignored dogfood --nocapture
    #[tokio::test]
    #[ignore = "makes a real, billable API call"]
    async fn dogfood_proofreads_the_guide() {
        let settings = crate::app_config::load_settings().await.expect("no settings");
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap().join("demo-project/le-guide");
        let target = std::env::var("DOGFOOD_SECTION")
            .unwrap_or_else(|_| "sections/01-overview.tex".into());
        let source = std::fs::read_to_string(root.join(&target)).expect("section");

        // Mirror the panel: preamble + labels + bib keys as context.
        let main = std::fs::read_to_string(root.join("main.tex")).unwrap();
        let bib = std::fs::read_to_string(root.join("refs.bib")).unwrap_or_default();
        let preamble: Vec<&str> = main.lines()
            .filter(|l| l.trim_start().starts_with("\\usepackage") || l.trim_start().starts_with("\\documentclass"))
            .collect();
        let keys: Vec<&str> = bib.lines()
            .filter_map(|l| l.trim().strip_prefix('@'))
            .filter_map(|l| l.split('{').nth(1))
            .map(|k| k.trim_end_matches(',').trim())
            .collect();

        let req = AiCallRequest {
            provider: settings.active_provider.clone(),
            model: settings.active_model.clone(),
            system_prompt: format!(
                "You are a LaTeX academic writing assistant. Review the LaTeX and return                  ONLY the corrected LaTeX — no commentary, no code fences. Fix grammar,                  clarity and academic tone; do not restructure or rewrite what is already                  clear. Preserve every command, environment and label exactly. Preserve the existing line breaks and wrapping exactly — reflowing a paragraph is a large diff with no visible effect on the output.\n\n                 ---\nContext from the user's project.\n\n## Preamble\n{}\n\n## Citation keys\n{}\n---",
                preamble.join("\n"), keys.join(", ")
            ),
            user_prompt: format!("Proofread this LaTeX section:\n\n{}", source),
            temperature: 0.2,
            max_tokens: 16384,
        };

        let key = settings.api_keys.get(&settings.active_provider).cloned();
        let endpoint = resolve_endpoint(&req.provider, &req.model, key).expect("endpoint");
        let client = reqwest::Client::new();
        let mut b = client.post(&endpoint.url).json(&build_body(&req, endpoint.wire, settings.reduce_reasoning));
        if let Some(x) = &endpoint.bearer { b = b.header("Authorization", format!("Bearer {}", x)); }
        if let Some(x) = &endpoint.api_key_header { b = b.header("x-api-key", x); }
        for (n, v) in &endpoint.extra_headers { b = b.header(*n, v); }

        let resp = b.send().await.expect("request");
        assert!(resp.status().is_success(), "{}", resp.text().await.unwrap_or_default());
        let mut stream = resp.bytes_stream();
        let mut dec = SseDecoder::default();
        let (mut out, mut think) = (String::new(), 0usize);
        while let Some(c) = stream.next().await {
            for f in dec.push(&c.expect("chunk"), endpoint.wire) {
                match f {
                    Frame::Text(t) => out.push_str(&t),
                    Frame::Reasoning(t) => think += t.len(),
                    _ => {}
                }
            }
        }
        eprintln!("[dogfood] {} -> {} chars out, {} thinking", target, out.len(), think);
        let stem = target.replace('/', "-");
        std::fs::write(format!("/tmp/dogfood-{stem}"), &out).unwrap();
        assert!(!out.trim().is_empty());
    }

    /// Exercise the real provider through the app's own endpoint resolution,
    /// body building and SSE decoder — the same code the AI Skills panel runs.
    /// Reads the key from the app's settings file; nothing is passed in.
    ///     cargo test --lib -- --ignored live_provider --nocapture
    #[tokio::test]
    #[ignore = "makes a real, billable API call"]
    async fn live_provider_streams_usable_latex() {
        let settings = crate::app_config::load_settings().await.expect("no settings");
        let provider = settings.active_provider.clone();
        let model = settings.active_model.clone();
        println!("provider={provider} model={model}");

        let req = AiCallRequest {
            provider: provider.clone(),
            model: model.clone(),
            system_prompt: "You are a LaTeX academic writing assistant. Return only \
                            corrected LaTeX, no commentary and no code fences."
                .into(),
            user_prompt: "Proofread and tighten this LaTeX, returning only the revised \
                          version:\n\nThe experiments that we ran showed good results \
                          across all three of the datasets that we evaluated on."
                .into(),
            temperature: 0.2,
            max_tokens: 4096,
        };

        let key = settings.api_keys.get(&provider).cloned();
        let endpoint = resolve_endpoint(&provider, &model, key).expect("endpoint");
        let client = reqwest::Client::new();
        let mut builder = client.post(&endpoint.url).json(&build_body(&req, endpoint.wire, settings.reduce_reasoning));
        if let Some(b) = &endpoint.bearer {
            builder = builder.header("Authorization", format!("Bearer {}", b));
        }
        if let Some(k) = &endpoint.api_key_header {
            builder = builder.header("x-api-key", k);
        }
        for (n, v) in &endpoint.extra_headers {
            builder = builder.header(*n, v);
        }

        let response = builder.send().await.expect("request failed");
        let status = response.status();
        println!("HTTP {status}");
        assert!(status.is_success(), "body: {}", response.text().await.unwrap_or_default());

        let mut stream = response.bytes_stream();
        let mut decoder = SseDecoder::default();
        let mut text = String::new();
        let mut chunks = 0;
        let mut reasoning = 0usize;
        let mut finish: Option<String> = None;
        while let Some(chunk) = stream.next().await {
            for frame in decoder.push(&chunk.expect("stream error"), endpoint.wire) {
                match frame {
                    Frame::Text(t) => { chunks += 1; text.push_str(&t); }
                    Frame::Reasoning(t) => { reasoning += t.len(); }
                    Frame::Finish(r) => { finish = Some(r); }
                    Frame::Done => {}
                }
            }
        }

        println!("--- {chunks} answer chunks, {reasoning} reasoning chars, finish={finish:?} ---\n{text}\n---");
        assert!(chunks > 1, "expected incremental streaming, got {chunks} chunk(s)");
        assert!(!text.trim().is_empty(), "decoder produced no text");
    }
}
