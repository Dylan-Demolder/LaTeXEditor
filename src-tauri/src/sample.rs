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
const TUTORIAL_DIR_NAME: &str = "LaTeXEditor Tutorial";

/// The hands-on tutorial, and what first run actually opens.
///
/// Deliberately a separate project folder rather than a subfolder of the guide:
/// the compiler picks the root `.tex` by looking for `\documentclass`, so two
/// complete documents under one project root would be ambiguous. Siblings in
/// Documents also match what the tutorial text says — "the folder beside this
/// one".
const TUTORIAL_FILES: &[(&str, &str)] = &[(
    "main.tex",
    include_str!("../../demo-project/tutorial/main.tex"),
)];

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
fn documents_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| format!("Could not locate a writable folder: {}", e))
}

/// Write a project out, unless it is already there.
///
/// An existing folder is left completely alone — these are meant to be edited,
/// and silently overwriting someone's annotated copy on every launch would be
/// its own bug.
async fn materialise(dir: &PathBuf, files: &[(&str, &str)]) -> Result<(), String> {
    if dir.exists() {
        return Ok(());
    }

    for (relative, contents) in files {
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

    Ok(())
}

/// Write out both bundled projects and return the one to open.
///
/// The tutorial is returned, not the guide. Landing someone in a sixteen-page
/// reference manual on first launch is a worse introduction than a one-page
/// document that asks them to press Cmd+Enter — the guide is still there, one
/// folder over, for when they want the detail.
///
/// Each folder is created independently, so someone upgrading from a build that
/// only shipped the guide gets the tutorial without their guide copy being
/// touched.
#[tauri::command]
pub async fn ensure_sample_project(app: tauri::AppHandle) -> Result<String, String> {
    let documents = documents_dir(&app)?;
    let guide = documents.join(DIR_NAME);
    let tutorial = documents.join(TUTORIAL_DIR_NAME);

    materialise(&guide, FILES).await?;
    materialise(&tutorial, TUTORIAL_FILES).await?;

    Ok(tutorial.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_embedded_file_has_content() {
        assert_eq!(FILES.len(), 8);
        for (path, contents) in FILES.iter().chain(TUTORIAL_FILES.iter()) {
            assert!(!contents.trim().is_empty(), "{} is empty", path);
        }
    }

    /// The tutorial must be a standalone compilable document: it is what first
    /// run opens, and a broken one is the worst possible first impression.
    #[test]
    fn tutorial_is_a_complete_document() {
        let main = TUTORIAL_FILES
            .iter()
            .find(|(p, _)| *p == "main.tex")
            .expect("tutorial main.tex must be embedded")
            .1;
        assert!(main.contains("\\documentclass"));
        assert!(main.contains("\\begin{document}"));
        assert!(main.contains("\\end{document}"));
        // It has no \input, and must not grow one: only main.tex is embedded.
        assert!(
            !main.contains("\\input{"),
            "the tutorial is shipped as a single file; embed the target too"
        );
    }

    /// The tutorial teaches specific keystrokes and skill names. If one is
    /// renamed in the app and not here, the tutorial silently starts lying.
    #[test]
    fn tutorial_references_things_that_exist() {
        let main = TUTORIAL_FILES.iter().find(|(p, _)| *p == "main.tex").unwrap().1;
        let skills = include_str!("../../src/data/ai-skills.ts");

        for name in [
            "Paste Data -> Table",
            "Notes -> Prose",
            "Fix Compilation Errors",
            "Executive Summary",
            "Tighten",
        ] {
            assert!(main.contains(name), "tutorial should walk through {name}");
            // The tutorial writes -> where the UI shows an arrow character.
            let ui_name = name.replace(" -> ", " → ");
            assert!(
                skills.contains(&ui_name) || skills.contains(name),
                "tutorial names a skill the app does not have: {ui_name}"
            );
        }

        // The step that deliberately breaks the build depends on this typo
        // staying a typo. A well-meaning spellcheck pass would defuse step 7.
        assert!(
            main.contains("\\inclduegraphics"),
            "step 7 needs its planted typo to still be wrong"
        );
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
