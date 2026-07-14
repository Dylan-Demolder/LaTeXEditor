use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use thiserror::Error;
use tokio::process::Command;

#[allow(dead_code)]
#[derive(Error, Debug)]
pub enum CompileError {
    #[error("LaTeX compiler not found: {0}")]
    CompilerNotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Compilation failed with exit code {0}\n{1}")]
    CompilationFailed(i32, String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for CompileError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub pdf_path: Option<String>,
    pub log_path: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub elapsed_ms: u64,
}

fn find_tex_compiler(preferred: Option<&str>) -> Result<String, CompileError> {
    let candidates = if let Some(pref) = preferred {
        vec![pref.to_string()]
    } else {
        vec![
            "pdflatex".to_string(),
            "xelatex".to_string(),
            "lualatex".to_string(),
            "latexmk".to_string(),
        ]
    };

    for compiler in &candidates {
        let output = std::process::Command::new("which")
            .arg(compiler)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if let Ok(status) = output {
            if status.success() {
                return Ok(compiler.clone());
            }
        }
    }

    Err(CompileError::CompilerNotFound(
        "No LaTeX compiler found. Install TeX Live or MiKTeX.".to_string(),
    ))
}

pub async fn compile(
    tex_file: &PathBuf,
    output_dir: &PathBuf,
    compiler_override: Option<&str>,
) -> Result<CompileResult, CompileError> {
    let start = std::time::Instant::now();

    let compiler = find_tex_compiler(compiler_override)?;

    let tex_dir = tex_file
        .parent()
        .ok_or_else(|| CompileError::Other("Invalid tex file path".to_string()))?;

    let tex_filename = tex_file
        .file_name()
        .ok_or_else(|| CompileError::Other("Invalid tex filename".to_string()))?
        .to_str()
        .unwrap_or("document.tex");

    let output = Command::new(&compiler)
        .arg("-interaction=nonstopmode")
        .arg("-output-directory")
        .arg(output_dir)
        .arg(tex_filename)
        .current_dir(tex_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let stem = tex_file
        .file_stem()
        .unwrap_or_default()
        .to_str()
        .unwrap_or("document");

    let pdf_path = output_dir.join(format!("{}.pdf", stem));
    let log_path = output_dir.join(format!("{}.log", stem));

    Ok(CompileResult {
        success: output.status.success(),
        pdf_path: Some(pdf_path.to_string_lossy().to_string()),
        log_path: Some(log_path.to_string_lossy().to_string()),
        stdout,
        stderr,
        elapsed_ms,
    })
}

pub async fn check_compiler_available() -> Vec<String> {
    let candidates = ["pdflatex", "xelatex", "lualatex", "latexmk"];
    let mut found = Vec::new();

    for compiler in &candidates {
        let status = std::process::Command::new("which")
            .arg(compiler)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if let Ok(s) = status {
            if s.success() {
                found.push(compiler.to_string());
            }
        }
    }

    found
}
