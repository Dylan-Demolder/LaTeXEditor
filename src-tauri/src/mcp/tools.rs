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
                        "description": "Project root directory path"
                    }
                })),
                required: Some(vec!["root".to_string()]),
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
        "get_errors" => handle_get_errors(&args).await,
        "get_project_structure" => handle_get_structure(&args).await,
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

            if !result.stdout.is_empty() {
                parts.push(format!("--- stdout ---\n{}", result.stdout));
            }

            if let Some(ref log_path) = result.log_path {
                let log_p = PathBuf::from(log_path);
                if log_p.exists() {
                    if let Ok(log_content) = tokio::fs::read_to_string(&log_p).await {
                        let main_tex = tex_file.file_name().unwrap_or_default().to_str().unwrap_or("doc.tex");
                        let parsed = parser::parse_log(&log_content, main_tex);
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

async fn handle_get_errors(args: &Value) -> CallToolResult {
    let tex_path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let tex_file = PathBuf::from(tex_path);
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

async fn handle_get_structure(args: &Value) -> CallToolResult {
    let root = args.get("root").and_then(|v| v.as_str()).unwrap_or("");
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
