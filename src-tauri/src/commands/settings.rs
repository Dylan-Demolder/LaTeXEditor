use crate::app_config::{self, AppSettings};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AiCallRequest {
    pub provider: String,
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_temperature() -> f64 { 0.7 }
fn default_max_tokens() -> u32 { 4096 }

#[derive(Debug, Serialize)]
pub struct AiCallResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<AiUsage>,
}

#[derive(Debug, Serialize)]
pub struct AiUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[tauri::command]
pub async fn call_ai(request: AiCallRequest) -> Result<AiCallResponse, String> {
    let settings = app_config::load_settings().await?;
    let api_key = settings.api_keys.get(&request.provider).cloned();

    match request.provider.as_str() {
        "openai" | "deepseek" | "grok" | "ollama" => {
            call_openai_compatible(
                &request,
                api_key.as_deref(),
                match request.provider.as_str() {
                    "openai" => "https://api.openai.com/v1/chat/completions",
                    "deepseek" => "https://api.deepseek.com/v1/chat/completions",
                    "grok" => "https://api.x.ai/v1/chat/completions",
                    "ollama" => "http://localhost:11434/v1/chat/completions",
                    _ => "https://api.openai.com/v1/chat/completions",
                },
            )
            .await
        }
        "anthropic" => {
            call_anthropic(&request, api_key.as_deref()).await
        }
        "openrouter" => {
            call_openrouter(&request, api_key.as_deref()).await
        }
        "opencode" => {
            call_opencode_mcp(&request).await
        }
        _ => Err(format!("Unknown provider: {}", request.provider)),
    }
}

async fn call_openai_compatible(
    req: &AiCallRequest,
    api_key: Option<&str>,
    base_url: &str,
) -> Result<AiCallResponse, String> {
    let mut body = serde_json::json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": req.system_prompt},
            {"role": "user", "content": req.user_prompt}
        ],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
    });

    if req.model.starts_with("o3") || req.model.starts_with("o4") {
        body.as_object_mut().unwrap().remove("temperature");
        body.as_object_mut().unwrap().insert(
            "max_completion_tokens".to_string(),
            serde_json::json!(req.max_tokens),
        );
    }

    let client = reqwest::Client::new();
    let mut builder = client.post(base_url).json(&body);

    if let Some(key) = api_key {
        builder = builder.header("Authorization", format!("Bearer {}", key));
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("API request failed: {}", e))?;

    let status = response.status();
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("API error ({}): {}", status, error_msg));
    }

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let usage = json.get("usage").map(|u| AiUsage {
        prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
        completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
        total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
    });

    Ok(AiCallResponse {
        content,
        model: req.model.clone(),
        usage,
    })
}

async fn call_anthropic(
    req: &AiCallRequest,
    api_key: Option<&str>,
) -> Result<AiCallResponse, String> {
    let key = api_key.ok_or("Anthropic API key not configured")?;

    let body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens,
        "system": req.system_prompt,
        "messages": [
            {"role": "user", "content": req.user_prompt}
        ],
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic API request failed: {}", e))?;

    let status = response.status();
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Anthropic API error: {}", error_msg));
    }

    let content = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let usage = json.get("usage").map(|u| AiUsage {
        prompt_tokens: u["input_tokens"].as_u64().unwrap_or(0) as u32,
        completion_tokens: u["output_tokens"].as_u64().unwrap_or(0) as u32,
        total_tokens: (u["input_tokens"].as_u64().unwrap_or(0)
            + u["output_tokens"].as_u64().unwrap_or(0)) as u32,
    });

    Ok(AiCallResponse {
        content,
        model: req.model.clone(),
        usage,
    })
}

async fn call_openrouter(
    req: &AiCallRequest,
    api_key: Option<&str>,
) -> Result<AiCallResponse, String> {
    let key = api_key.ok_or("OpenRouter API key not configured")?;

    let body = serde_json::json!({
        "model": req.model,
        "messages": [
            {"role": "system", "content": req.system_prompt},
            {"role": "user", "content": req.user_prompt}
        ],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("HTTP-Referer", "https://latexeditor.app")
        .header("X-Title", "LaTeXEditor")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenRouter request failed: {}", e))?;

    let status = response.status();
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !status.is_success() {
        let error_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("OpenRouter error: {}", error_msg));
    }

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let usage = json.get("usage").map(|u| AiUsage {
        prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
        completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
        total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
    });

    Ok(AiCallResponse {
        content,
        model: req.model.clone(),
        usage,
    })
}

async fn call_opencode_mcp(_req: &AiCallRequest) -> Result<AiCallResponse, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "compile",
            "arguments": { "path": "" }
        }
    });

    let response = client
        .post("http://127.0.0.1:9876/mcp")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MCP request failed: {}", e))?;

    let _json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse: {}", e))?;

    Ok(AiCallResponse {
        content: format!(
            "MCP Server at http://127.0.0.1:9876\nActive tools: compile, read_file, write_file, get_errors, get_project_structure, get_section_structure\n\nUse any MCP client connected to this endpoint.",
        ),
        model: "mcp-agent".to_string(),
        usage: None,
    })
}

#[tauri::command]
pub async fn load_settings() -> Result<AppSettings, String> {
    app_config::load_settings().await
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    app_config::save_settings(&settings).await
}
