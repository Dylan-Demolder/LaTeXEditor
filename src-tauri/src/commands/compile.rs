use crate::latex::compiler;
use crate::latex::parser;
use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Serialize)]
pub struct CompileCommandResult {
    pub success: bool,
    pub pdf_path: Option<String>,
    pub log_path: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub elapsed_ms: u64,
    pub errors: Vec<parser::LaTeXError>,
    pub warnings: Vec<parser::LaTeXError>,
    pub badboxes: Vec<parser::LaTeXError>,
    pub message: String,
}

#[tauri::command]
pub async fn compile_latex(
    tex_file: String,
    output_dir: String,
    compiler_override: Option<String>,
) -> Result<CompileCommandResult, String> {
    let tex_path = PathBuf::from(&tex_file);
    let out_dir = PathBuf::from(&output_dir);

    if !tex_path.exists() {
        return Err(format!("TeX file not found: {}", tex_file));
    }

    fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let compiler_override = compiler_override.as_deref();

    let compile_result = compiler::compile(&tex_path, &out_dir, compiler_override)
        .await
        .map_err(|e| e.to_string())?;

    let parsed = if let Some(ref log_path) = compile_result.log_path {
        let log_path = PathBuf::from(log_path);
        if log_path.exists() {
            let log_content = fs::read_to_string(&log_path)
                .await
                .unwrap_or_default();

            let main_tex = tex_path
                .file_name()
                .unwrap_or_default()
                .to_str()
                .unwrap_or("document.tex");

            parser::parse_log(&log_content, main_tex)
        } else {
            parser::ParseResult {
                errors: vec![],
                warnings: vec![],
                badboxes: vec![],
            }
        }
    } else {
        parser::ParseResult {
            errors: vec![],
            warnings: vec![],
            badboxes: vec![],
        }
    };

    let message = if compile_result.success {
        format!(
            "Compilation successful in {}ms{}",
            compile_result.elapsed_ms,
            if !parsed.warnings.is_empty() {
                format!(" ({} warnings)", parsed.warnings.len())
            } else {
                String::new()
            }
        )
    } else {
        format!(
            "Compilation failed ({} errors, {} warnings)",
            parsed.errors.len(),
            parsed.warnings.len()
        )
    };

    Ok(CompileCommandResult {
        success: compile_result.success,
        pdf_path: compile_result.pdf_path,
        log_path: compile_result.log_path,
        stdout: compile_result.stdout,
        stderr: compile_result.stderr,
        elapsed_ms: compile_result.elapsed_ms,
        errors: parsed.errors,
        warnings: parsed.warnings,
        badboxes: parsed.badboxes,
        message,
    })
}

#[tauri::command]
pub async fn check_compilers() -> Vec<String> {
    compiler::check_compiler_available().await
}
