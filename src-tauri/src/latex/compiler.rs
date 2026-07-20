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

pub const KNOWN_COMPILERS: [&str; 4] = ["pdflatex", "xelatex", "lualatex", "latexmk"];

/// Directories to search for a TeX binary, in priority order.
///
/// PATH alone is not enough. A macOS app launched from Finder or the Dock
/// inherits a minimal environment — roughly `/usr/bin:/bin:/usr/sbin:/sbin` —
/// so `which pdflatex` fails inside the bundled app even when it works in a
/// terminal. Every TeX install location therefore has to be checked explicitly.
fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }

    // MacTeX / official TeX Live on macOS.
    dirs.push(PathBuf::from("/Library/TeX/texbin"));
    dirs.push(PathBuf::from("/usr/texbin"));
    // Homebrew (Apple silicon, then Intel), MacPorts.
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs.push(PathBuf::from("/opt/local/bin"));
    // Linux distributions.
    dirs.push(PathBuf::from("/usr/bin"));
    // Per-user installs.
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join("bin"));
    }

    // A direct TeX Live install nests binaries under a year and architecture
    // directory (…/texlive/2026/bin/universal-darwin), so glob a level down.
    for root in ["/usr/local/texlive", "/opt/texlive"] {
        if let Ok(years) = std::fs::read_dir(root) {
            for year in years.flatten() {
                let bin = year.path().join("bin");
                if let Ok(arches) = std::fs::read_dir(&bin) {
                    for arch in arches.flatten() {
                        dirs.push(arch.path());
                    }
                }
            }
        }
    }

    dirs.retain(|d| d.is_dir());
    dirs.dedup();
    dirs
}

fn is_executable(path: &std::path::Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return std::fs::metadata(path)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// Absolute path to a named compiler, or None if it is not installed.
pub fn resolve_compiler(name: &str) -> Option<PathBuf> {
    let exe_names: Vec<String> = if cfg!(windows) {
        vec![format!("{}.exe", name), name.to_string()]
    } else {
        vec![name.to_string()]
    };

    for dir in candidate_dirs() {
        for exe in &exe_names {
            let candidate = dir.join(exe);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn find_tex_compiler(preferred: Option<&str>) -> Result<PathBuf, CompileError> {
    let candidates: Vec<&str> = match preferred {
        Some(pref) => vec![pref],
        None => KNOWN_COMPILERS.to_vec(),
    };

    for name in candidates {
        if let Some(path) = resolve_compiler(name) {
            return Ok(path);
        }
    }

    Err(CompileError::CompilerNotFound(format!(
        "No LaTeX compiler found. Install TeX Live, MacTeX or MiKTeX. Searched: {}",
        candidate_dirs()
            .iter()
            .map(|d| d.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    )))
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

    // latexmk invokes pdflatex/biber as child processes and looks them up on
    // PATH, so resolving our own binary absolutely is not sufficient — the
    // compiler's own directory has to be on the PATH we hand down.
    let child_path = match compiler.parent() {
        Some(dir) => {
            let existing = std::env::var_os("PATH").unwrap_or_default();
            let mut entries = vec![dir.to_path_buf()];
            entries.extend(std::env::split_paths(&existing));
            std::env::join_paths(entries).unwrap_or(existing)
        }
        None => std::env::var_os("PATH").unwrap_or_default(),
    };

    let output = Command::new(&compiler)
        .arg("-interaction=nonstopmode")
        .arg("-output-directory")
        .arg(output_dir)
        .arg(tex_filename)
        .current_dir(tex_dir)
        .env("PATH", child_path)
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
    KNOWN_COMPILERS
        .iter()
        .filter(|name| resolve_compiler(name).is_some())
        .map(|name| name.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_includes_locations_a_finder_launched_app_would_miss() {
        let dirs = candidate_dirs();
        // Only directories that exist are kept, so assert against the full list
        // this machine could offer rather than requiring TeX to be installed.
        assert!(!dirs.is_empty(), "should always find at least /usr/bin");
        // The bug this guards: relying on PATH alone. A GUI app's PATH is
        // /usr/bin:/bin:/usr/sbin:/sbin, so these must be searched explicitly.
        let all = format!("{:?}", dirs);
        assert!(
            all.contains("/usr/bin"),
            "standard system bin must be searched: {all}"
        );
    }

    #[test]
    fn resolves_a_binary_that_definitely_exists() {
        // `sh` lives in /bin on every unix; proves the resolver actually finds
        // and permission-checks a real executable.
        #[cfg(unix)]
        {
            let found = resolve_compiler("sh");
            assert!(found.is_some(), "should resolve /bin/sh");
            assert!(is_executable(&found.unwrap()));
        }
    }

    #[test]
    fn missing_binary_resolves_to_none() {
        assert!(resolve_compiler("definitely-not-a-real-compiler-xyz").is_none());
    }

    #[test]
    fn candidate_dirs_are_deduplicated_and_real() {
        for dir in candidate_dirs() {
            assert!(dir.is_dir(), "{} should have been filtered out", dir.display());
        }
    }
}

#[cfg(test)]
mod integration {
    use super::*;

    /// Compile the bundled guide through the app's own compile path — the same
    /// discovery, spawn, PATH handling and result parsing the Typeset button
    /// uses. Requires a TeX installation:
    ///     cargo test --lib -- --ignored compiles_the_bundled_guide
    #[tokio::test]
    #[ignore = "requires a LaTeX distribution"]
    async fn compiles_the_bundled_guide() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("demo-project/le-guide");
        let tex = root.join("main.tex");
        let out = std::env::temp_dir().join("le-guide-apptest");
        let _ = std::fs::remove_dir_all(&out);
        std::fs::create_dir_all(&out).unwrap();

        let found = check_compiler_available().await;
        assert!(!found.is_empty(), "no compiler resolved: {:?}", candidate_dirs());
        println!("resolved compilers: {:?}", found);
        println!("pdflatex at: {:?}", resolve_compiler("pdflatex"));

        let result = compile(&tex, &out, None).await.expect("compile call failed");
        println!("success={} in {}ms", result.success, result.elapsed_ms);

        let log = std::fs::read_to_string(out.join("main.log")).unwrap_or_default();
        let parsed = crate::latex::parser::parse_log(&log, "main.tex");
        println!(
            "parsed: {} errors, {} warnings, {} badboxes",
            parsed.errors.len(),
            parsed.warnings.len(),
            parsed.badboxes.len()
        );
        for e in &parsed.errors {
            println!("  ERROR {}:{} {}", e.file, e.line, e.message);
        }

        assert!(result.success, "compiler exited non-zero");
        assert!(parsed.errors.is_empty(), "guide produced LaTeX errors");
        let pdf = out.join("main.pdf");
        assert!(pdf.exists(), "no PDF at {}", pdf.display());
        let size = std::fs::metadata(&pdf).unwrap().len();
        println!("PDF: {} bytes", size);
        assert!(size > 50_000, "PDF suspiciously small: {size} bytes");
    }
}
