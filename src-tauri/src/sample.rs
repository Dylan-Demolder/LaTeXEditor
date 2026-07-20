//! The bundled example project, opened on first launch.
//!
//! The guide is compiled into the binary with `include_str!` rather than
//! shipped as a Tauri resource. Resource paths resolve differently under
//! `tauri dev` and inside a packaged `.app`, and a first-run feature that
//! works in development but not in the build is worse than useless. Embedding
//! costs ~45 KB and cannot go missing.

use std::path::PathBuf;
use tauri::Manager;
use tokio::fs;

const DIR_NAME: &str = "LaTeXEditor Guide";

/// (relative path, contents). Keep in sync with demo-project/le-guide.
const FILES: &[(&str, &str)] = &[
    ("main.tex", include_str!("../../demo-project/le-guide/main.tex")),
    ("refs.bib", include_str!("../../demo-project/le-guide/refs.bib")),
    (
        "sections/01-overview.tex",
        include_str!("../../demo-project/le-guide/sections/01-overview.tex"),
    ),
    (
        "sections/02-getting-started.tex",
        include_str!("../../demo-project/le-guide/sections/02-getting-started.tex"),
    ),
    (
        "sections/03-writing.tex",
        include_str!("../../demo-project/le-guide/sections/03-writing.tex"),
    ),
    (
        "sections/04-ai-assistant.tex",
        include_str!("../../demo-project/le-guide/sections/04-ai-assistant.tex"),
    ),
    (
        "sections/05-integrations.tex",
        include_str!("../../demo-project/le-guide/sections/05-integrations.tex"),
    ),
    (
        "sections/06-reference.tex",
        include_str!("../../demo-project/le-guide/sections/06-reference.tex"),
    ),
];

/// Somewhere the user can find it and the compiler can write beside it.
/// Never inside the app bundle: that is read-only, and writing there breaks
/// code signing on macOS.
fn destination(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("Could not locate a writable folder: {}", e))?;
    Ok(base.join(DIR_NAME))
}

/// Materialise the guide and return its path.
///
/// If the folder already exists it is left completely alone — the guide is
/// meant to be edited, and silently overwriting someone's annotated copy on
/// every launch would be its own bug.
#[tauri::command]
pub async fn ensure_sample_project(app: tauri::AppHandle) -> Result<String, String> {
    let dir = destination(&app)?;

    if dir.exists() {
        return Ok(dir.to_string_lossy().to_string());
    }

    for (relative, contents) in FILES {
        let target = dir.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
        }
        fs::write(&target, contents)
            .await
            .map_err(|e| format!("Failed to write {}: {}", target.display(), e))?;
    }

    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_embedded_file_has_content() {
        assert_eq!(FILES.len(), 8);
        for (path, contents) in FILES {
            assert!(!contents.trim().is_empty(), "{} is empty", path);
        }
    }

    /// The root file is what the compiler is pointed at; if this regresses,
    /// first-run typesetting silently builds nothing.
    #[test]
    fn main_tex_is_a_complete_document() {
        let main = FILES
            .iter()
            .find(|(p, _)| *p == "main.tex")
            .expect("main.tex must be embedded")
            .1;
        assert!(main.contains("\\documentclass"));
        assert!(main.contains("\\begin{document}"));
        assert!(main.contains("\\end{document}"));
    }

    /// Every \input target must be embedded, or the build breaks on first run.
    #[test]
    fn all_inputs_are_embedded() {
        let main = FILES.iter().find(|(p, _)| *p == "main.tex").unwrap().1;
        for line in main.lines() {
            if let Some(rest) = line.trim().strip_prefix("\\input{") {
                let target = format!("{}.tex", rest.trim_end_matches('}'));
                assert!(
                    FILES.iter().any(|(p, _)| *p == target),
                    "main.tex inputs {} but it is not embedded",
                    target
                );
            }
        }
    }
}
