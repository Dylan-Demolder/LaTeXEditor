use crate::commands::project::{open_project, read_file as read_file_cmd};
use crate::latex::compiler;
use crate::latex::parser;
use crate::mcp::protocol::{CallToolResult, Tool, ToolContent, ToolInputSchema};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub fn get_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "read_file".to_string(),
            description: Some("Read the contents of a LaTeX file in the project".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "path": {
                        "type": "string",
                        "description": "Path to the .tex file relative to the project root"
                    }
                })),
                required: Some(vec!["path".to_string()]),
            },
        },
        Tool {
            name: "write_file".to_string(),
            description: Some("Write or overwrite a LaTeX file in the project".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "path": {
                        "type": "string",
                        "description": "Path to the file relative to the project root"
                    },
                    "content": {
                        "type": "string",
                        "description": "The LaTeX content to write"
                    }
                })),
                required: Some(vec!["path".to_string(), "content".to_string()]),
            },
        },
        Tool {
            name: "compile".to_string(),
            description: Some("Compile a LaTeX document and return any errors or warnings".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "path": {
                        "type": "string",
                        "description": "Path to the .tex file to compile"
                    },
                    "compiler": {
                        "type": "string",
                        "description": "LaTeX compiler to use (pdflatex, xelatex, lualatex)"
                    }
                })),
                required: Some(vec!["path".to_string()]),
            },
        },
        Tool {
            name: "get_errors".to_string(),
            description: Some("Parse the .log file and return compilation errors for a given .tex file".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "path": {
                        "type": "string",
                        "description": "Path to the .tex file whose .log errors you want to inspect"
                    }
                })),
                required: Some(vec!["path".to_string()]),
            },
        },
        Tool {
            name: "get_project_structure".to_string(),
            description: Some("Return the file tree of the current LaTeX project".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "root": {
                        "type": "string",
                        "description": "Project root. Optional — defaults to the project currently open in the editor."
                    }
                })),
                required: Some(vec![]),
            },
        },
        Tool {
            name: "get_section_structure".to_string(),
            description: Some("Extract the section headings from a LaTeX file".to_string()),
            input_schema: ToolInputSchema {
                schema_type: "object".to_string(),
                properties: Some(json!({
                    "path": {
                        "type": "string",
                        "description": "Path to the .tex file"
                    }
                })),
                required: Some(vec!["path".to_string()]),
            },
        },
    ]
}

pub async fn call_tool(
    name: &str,
    arguments: Option<Value>,
    project_path: Arc<Mutex<Option<String>>>,
) -> CallToolResult {
    let args = arguments.unwrap_or(Value::Null);

    match name {
        "read_file" => handle_read_file(&args, &project_path).await,
        "write_file" => handle_write_file(&args, &project_path).await,
        "compile" => handle_compile(&args, &project_path).await,
        "get_errors" => handle_get_errors(&args, &project_path).await,
        "get_project_structure" => handle_get_structure(&args, &project_path).await,
        "get_section_structure" => handle_section_structure(&args, &project_path).await,
        _ => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Unknown tool: {}", name)),
            }],
            is_error: Some(true),
        },
    }
}

async fn resolve_path(args: &Value, project_path: &Arc<Mutex<Option<String>>>) -> String {
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let proj = project_path.lock().await;
    if let Some(ref root) = *proj {
        if path.starts_with('/') {
            path.to_string()
        } else {
            format!("{}/{}", root, path)
        }
    } else {
        path.to_string()
    }
}

async fn handle_read_file(args: &Value, project_path: &Arc<Mutex<Option<String>>>) -> CallToolResult {
    let path = resolve_path(args, project_path).await;
    match read_file_cmd(path.clone()).await {
        Ok(content) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(content),
            }],
            is_error: None,
        },
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Error reading {}: {}", path, e)),
            }],
            is_error: Some(true),
        },
    }
}

async fn handle_write_file(args: &Value, project_path: &Arc<Mutex<Option<String>>>) -> CallToolResult {
    let path = resolve_path(args, project_path).await;
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    match crate::commands::project::write_file(path.clone(), content.to_string()).await {
        Ok(()) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Successfully wrote {}", path)),
            }],
            is_error: None,
        },
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Error writing {}: {}", path, e)),
            }],
            is_error: Some(true),
        },
    }
}

/// Last `n` lines of a blob, for surfacing a diagnostic without the preamble.
fn tail_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Pages reported by pdflatex.
///
/// The log is hard-wrapped at 79 columns, so "Output written on x.pdf (10
/// pages" can be split mid-word — matching line by line silently misses it.
/// Newlines are stripped before searching.
fn page_count(log: &str) -> Option<u32> {
    let flat: String = log.chars().filter(|c| *c != '\n').collect();
    let idx = flat.rfind(" pages")?;
    let head = &flat[..idx];
    let start = head.rfind('(')? + 1;
    head[start..].trim().parse().ok()
}

async fn handle_compile(args: &Value, project_path: &Arc<Mutex<Option<String>>>) -> CallToolResult {
    let tex_path = resolve_path(args, project_path).await;
    let tex_file = PathBuf::from(&tex_path);
    let out_dir = tex_file.parent().unwrap_or(&PathBuf::from(".")).join("build");
    let compiler_override = args.get("compiler").and_then(|v| v.as_str());

    let _ = tokio::fs::create_dir_all(&out_dir).await;

    match compiler::compile(&tex_file, &out_dir, compiler_override).await {
        Ok(result) => {
            let mut parts = vec![
                if result.success {
                    "Compilation succeeded".to_string()
                } else {
                    "Compilation failed".to_string()
                },
                format!("Elapsed: {}ms", result.elapsed_ms),
            ];

            // Deliberately not the whole stdout. A successful pdflatex run
            // emits several hundred lines of font and package paths, which for
            // an MCP client is thousands of tokens saying nothing. On failure
            // the tail is where the diagnostic lives, so keep that much.
            if !result.success && !result.stdout.is_empty() {
                parts.push(format!("--- output (tail) ---\n{}", tail_lines(&result.stdout, 40)));
            }

            if let Some(ref log_path) = result.log_path {
                let log_p = PathBuf::from(log_path);
                if log_p.exists() {
                    if let Ok(log_content) = tokio::fs::read_to_string(&log_p).await {
                        let main_tex = tex_file.file_name().unwrap_or_default().to_str().unwrap_or("doc.tex");
                        let parsed = parser::parse_log(&log_content, main_tex);

                        // The page count is the single most useful fact about a
                        // successful build and was the one thing a client had
                        // to parse the log itself to get.
                        if let Some(pages) = page_count(&log_content) {
                            parts.push(format!("Pages: {}", pages));
                        }
                        if !parsed.badboxes.is_empty() {
                            parts.push(format!("Badboxes: {}", parsed.badboxes.len()));
                        }
                        if !parsed.errors.is_empty() {
                            let err_lines: Vec<String> = parsed.errors.iter().map(|e| {
                                format!("Line {}: {}", e.line, e.message)
                            }).collect();
                            parts.push(format!("--- Errors ---\n{}", err_lines.join("\n")));
                        }
                        if !parsed.warnings.is_empty() {
                            let warn_lines: Vec<String> = parsed.warnings.iter().map(|w| {
                                format!("Line {}: {}", w.line, w.message)
                            }).collect();
                            parts.push(format!("--- Warnings ---\n{}", warn_lines.join("\n")));
                        }
                    }
                }
            }

            CallToolResult {
                content: vec![ToolContent {
                    content_type: "text".to_string(),
                    text: Some(parts.join("\n\n")),
                }],
                is_error: Some(!result.success),
            }
        }
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Compilation error: {}", e)),
            }],
            is_error: Some(true),
        },
    }
}

async fn handle_get_errors(
    args: &Value,
    project_path: &Arc<Mutex<Option<String>>>,
) -> CallToolResult {
    // Must go through resolve_path like every other tool. Reading the raw
    // argument made this the only tool requiring an absolute path: a relative
    // one resolved against the app process's working directory, so an agent
    // that had just written and compiled "paper.tex" successfully got
    // "No such file or directory" when asking for its errors.
    let tex_path = resolve_path(args, project_path).await;
    let tex_file = PathBuf::from(&tex_path);
    let stem = tex_file.file_stem().unwrap_or_default().to_str().unwrap_or("");
    let dots = PathBuf::from(".");
    let parent = tex_file.parent().unwrap_or(&dots);
    let log_path = parent.join("build").join(format!("{}.log", stem));

    match tokio::fs::read_to_string(&log_path).await {
        Ok(content) => {
            let main_tex = tex_file.file_name().unwrap_or_default().to_str().unwrap_or("");
            let parsed = parser::parse_log(&content, main_tex);
            let summary = json!({
                "errors": parsed.errors.iter().map(|e| json!({
                    "line": e.line,
                    "message": e.message,
                    "file": e.file,
                    "context": e.context
                })).collect::<Vec<_>>(),
                "warnings": parsed.warnings.iter().map(|w| json!({
                    "line": w.line,
                    "message": w.message,
                    "file": w.file,
                })).collect::<Vec<_>>(),
                "badboxes": parsed.badboxes.iter().map(|b| json!({
                    "line": b.line,
                    "message": b.message,
                })).collect::<Vec<_>>(),
            });
            CallToolResult {
                content: vec![ToolContent {
                    content_type: "text".to_string(),
                    text: Some(serde_json::to_string_pretty(&summary).unwrap_or_default()),
                }],
                is_error: None,
            }
        }
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Could not read log file {}: {}", log_path.display(), e)),
            }],
            is_error: Some(true),
        },
    }
}

async fn handle_get_structure(
    args: &Value,
    project_path: &Arc<Mutex<Option<String>>>,
) -> CallToolResult {
    // Every other tool resolves against the open project; this one used to
    // demand an explicit root, so an agent that simply asked "what is in this
    // project?" got "Directory not found". Accept `path` as well — the other
    // five tools all use that name, and guessing wrong is a silent failure.
    let explicit = args
        .get("root")
        .or_else(|| args.get("path"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let root = match explicit {
        Some(r) => r.to_string(),
        None => match project_path.lock().await.clone() {
            Some(open) => open,
            None => {
                return CallToolResult {
                    content: vec![ToolContent {
                        content_type: "text".to_string(),
                        text: Some(
                            "No project is open in the editor. Pass `root`, or open a project first."
                                .to_string(),
                        ),
                    }],
                    is_error: Some(true),
                }
            }
        },
    };
    let root = root.as_str();
    match open_project(root.to_string()).await {
        Ok(tree) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(serde_json::to_string_pretty(&tree.files).unwrap_or_default()),
            }],
            is_error: None,
        },
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Error scanning project: {}", e)),
            }],
            is_error: Some(true),
        },
    }
}

async fn handle_section_structure(args: &Value, project_path: &Arc<Mutex<Option<String>>>) -> CallToolResult {
    let path = resolve_path(args, project_path).await;
    match read_file_cmd(path.clone()).await {
        Ok(content) => {
            use regex::Regex;
            let re = Regex::new(r"\\(section|subsection|subsubsection|chapter|paragraph)\{([^}]*)\}").unwrap();
            let sections: Vec<serde_json::Value> = re
                .captures_iter(&content)
                .map(|caps| {
                    json!({
                        "level": caps[1].to_string(),
                        "title": caps[2].to_string()
                    })
                })
                .collect();

            CallToolResult {
                content: vec![ToolContent {
                    content_type: "text".to_string(),
                    text: Some(serde_json::to_string_pretty(&json!({"sections": sections})).unwrap_or_default()),
                }],
                is_error: None,
            }
        }
        Err(e) => CallToolResult {
            content: vec![ToolContent {
                content_type: "text".to_string(),
                text: Some(format!("Error reading {}: {}", path, e)),
            }],
            is_error: Some(true),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every path-taking tool must accept a project-relative path. get_errors
    /// once read the raw argument instead of calling resolve_path, so it was
    /// the only tool that demanded an absolute one — an inconsistency an agent
    /// hits immediately after a successful compile.
    #[tokio::test]
    async fn resolve_path_makes_relative_paths_project_relative() {
        let project = Arc::new(Mutex::new(Some("/tmp/proj".to_string())));
        let args = json!({ "path": "paper.tex" });
        assert_eq!(resolve_path(&args, &project).await, "/tmp/proj/paper.tex");
    }

    #[tokio::test]
    async fn resolve_path_leaves_absolute_paths_alone() {
        let project = Arc::new(Mutex::new(Some("/tmp/proj".to_string())));
        let args = json!({ "path": "/elsewhere/paper.tex" });
        assert_eq!(resolve_path(&args, &project).await, "/elsewhere/paper.tex");
    }

    /// With no project open there is nothing to resolve against; the path is
    /// passed through rather than being silently joined to an empty root.
    /// The wrapped-log case that made a naive line-by-line match fail: real
    /// pdflatex output splits "(10 pages" across the 79-column boundary.
    #[test]
    fn page_count_survives_the_log_line_wrap() {
        let wrapped = "...fonts here...\nOutput written on /a/b/04-rag.pdf (10 pag\nes, 286439 bytes).\n";
        assert_eq!(page_count(wrapped), Some(10));
    }

    #[test]
    fn page_count_reads_an_unwrapped_line() {
        assert_eq!(
            page_count("Output written on main.pdf (7 pages, 100 bytes).\n"),
            Some(7)
        );
    }

    #[test]
    fn page_count_is_none_when_nothing_was_written() {
        assert_eq!(page_count("! LaTeX Error: something went wrong.\n"), None);
    }

    #[test]
    fn tail_lines_returns_the_end_and_tolerates_short_input() {
        assert_eq!(tail_lines("a\nb\nc\nd", 2), "c\nd");
        assert_eq!(tail_lines("only", 10), "only");
    }

    #[tokio::test]
    async fn resolve_path_passes_through_when_no_project_is_open() {
        let project = Arc::new(Mutex::new(None));
        let args = json!({ "path": "paper.tex" });
        assert_eq!(resolve_path(&args, &project).await, "paper.tex");
    }
}
