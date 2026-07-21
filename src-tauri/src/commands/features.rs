use crate::commands::project;
use crate::git;
use crate::synctex;
use serde::Serialize;
use std::path::PathBuf;

// ── Git commands ──

#[derive(Debug, Serialize)]
pub struct GitInfo {
    pub is_repo: bool,
    pub status: Option<git::commands::GitStatus>,
    pub commits: Vec<git::commands::GitCommit>,
    pub branches: Vec<String>,
}

#[tauri::command]
pub async fn git_status(project_path: String) -> Result<GitInfo, String> {
    let status = git::commands::get_status(&project_path)?;
    let commits = git::commands::git_log(&project_path, 10).unwrap_or_default();
    let branches = git::commands::git_branches(&project_path).unwrap_or_default();
    Ok(GitInfo {
        is_repo: true,
        status: Some(status),
        commits,
        branches,
    })
}

#[tauri::command]
pub async fn git_init(project_path: String) -> Result<String, String> {
    git::commands::git_init(&project_path)?;
    Ok("Repository initialized".to_string())
}

#[tauri::command]
pub async fn git_add(project_path: String, files: Vec<String>) -> Result<String, String> {
    git::commands::git_add(&project_path, files)?;
    Ok("Files staged".to_string())
}

#[tauri::command]
pub async fn git_commit(project_path: String, message: String) -> Result<String, String> {
    let hash = git::commands::git_commit(&project_path, &message)?;
    Ok(hash)
}

#[tauri::command]
pub async fn git_push(project_path: String) -> Result<String, String> {
    git::commands::git_push(&project_path)?;
    Ok("Pushed successfully".to_string())
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> Result<String, String> {
    git::commands::git_pull(&project_path)?;
    Ok("Pulled successfully".to_string())
}

#[tauri::command]
pub async fn git_diff(project_path: String, file_path: String) -> Result<git::commands::GitDiff, String> {
    git::commands::git_diff_file(&project_path, &file_path)
}

#[tauri::command]
pub async fn git_checkout(project_path: String, branch: String) -> Result<String, String> {
    git::commands::git_checkout(&project_path, &branch)?;
    Ok(format!("Checked out {}", branch))
}

// ── SyncTeX commands ──

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub successful: bool,
    pub page: Option<u32>,
    pub file: Option<String>,
    pub line: Option<u32>,
}

#[tauri::command]
pub async fn synctex_forward(
    tex_path: String,
    output_dir: String,
    line: u32,
    _col: u32,
) -> Result<SyncResult, String> {
    let result = synctex::parse_synctex(&tex_path, &output_dir)?;
    if let Some(page) = synctex::find_page_for_line(&result.forward, &tex_path, line) {
        Ok(SyncResult {
            successful: true,
            page: Some(page),
            file: None,
            line: None,
        })
    } else {
        Ok(SyncResult {
            successful: false,
            page: None,
            file: None,
            line: None,
        })
    }
}

#[tauri::command]
pub async fn synctex_inverse(
    tex_path: String,
    output_dir: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<SyncResult, String> {
    let result = synctex::parse_synctex(&tex_path, &output_dir)?;
    if let Some((file, line)) = synctex::find_line_for_page(&result.inverse, page, x, y) {
        Ok(SyncResult {
            successful: true,
            page: None,
            file: Some(file),
            line: Some(line),
        })
    } else {
        Ok(SyncResult {
            successful: false,
            page: None,
            file: None,
            line: None,
        })
    }
}

// ── Multi-file / root detection ──

#[derive(Debug, Serialize)]
pub struct ProjectStructure {
    pub root_file: String,
    pub files: Vec<String>,
    pub dependencies: Vec<Dependency>,
}

#[derive(Debug, Serialize)]
pub struct Dependency {
    pub from: String,
    pub to: String,
    pub kind: String, // "input" or "include"
}

/// Locate the document to compile.
///
/// `active_file` is the file the user is editing. If it is itself a root ---
/// it has its own `\\documentclass` --- then it *is* what they want typeset,
/// and no search is needed. This matters in a project holding several
/// independent documents: the fallback below picks the shortest path, so a
/// folder of five standalone papers would always compile the one with the
/// shortest filename no matter which was open.
///
/// The search is only the right answer when the open file is a fragment
/// pulled in by `\\input`, which has no `\\documentclass` of its own.
#[tauri::command]
pub async fn find_root_file(
    project_path: String,
    active_file: Option<String>,
) -> Result<String, String> {
    if let Some(active) = active_file.as_deref().filter(|a| !a.is_empty()) {
        if let Ok(content) = std::fs::read_to_string(active) {
            if content.contains("\\documentclass") {
                return Ok(active.to_string());
            }
        }
    }

    let path = PathBuf::from(&project_path);

    // Scan all .tex files for \documentclass — that's the root
    let mut entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut candidates = Vec::new();

    while let Some(entry) = entries.next() {
        let entry = entry.map_err(|e| e.to_string())?;
        let fpath = entry.path();
        if fpath.extension().map_or(false, |e| e == "tex") {
            if let Ok(content) = std::fs::read_to_string(&fpath) {
                if content.contains("\\documentclass") {
                    candidates.push(fpath.to_string_lossy().to_string());
                }
            }
        }
    }

    // Also scan subdirectories
    fn scan_dir(dir: &PathBuf, candidates: &mut Vec<String>) -> Result<(), String> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let fpath = entry.path();
                if fpath.is_dir() {
                    let name = fpath.file_name().unwrap_or_default().to_string_lossy();
                    if name != "build" && !name.starts_with('.') {
                        let _ = scan_dir(&fpath, candidates);
                    }
                } else if fpath.extension().map_or(false, |e| e == "tex") {
                    if let Ok(content) = std::fs::read_to_string(&fpath) {
                        if content.contains("\\documentclass") {
                            candidates.push(fpath.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        Ok(())
    }
    scan_dir(&path, &mut candidates)?;

    // Fallback: the open file is a fragment, so guess. A shorter path is more
    // likely to be the root (main.tex beside sections/intro.tex), which is a
    // reasonable heuristic for a single-document project and only reached when
    // the open file gave us nothing better.
    candidates.sort_by_key(|c| c.len());
    candidates
        .first()
        .cloned()
        .ok_or_else(|| "No .tex file with \\documentclass found".to_string())
}

#[tauri::command]
pub async fn get_dependencies(tex_path: String) -> Result<Vec<Dependency>, String> {
    let content = project::read_file(tex_path.clone()).await?;
    let mut deps = Vec::new();

    let re_input = regex::Regex::new(r"\\(input|include)\{([^}]+)\}").unwrap();
    for caps in re_input.captures_iter(&content) {
        deps.push(Dependency {
            from: tex_path.clone(),
            to: caps[2].to_string(),
            kind: caps[1].to_string(),
        });
    }

    Ok(deps)
}

#[cfg(test)]
mod root_file_tests {
    use super::*;

    fn write(dir: &std::path::Path, name: &str, body: &str) -> String {
        let p = dir.join(name);
        std::fs::write(&p, body).unwrap();
        p.to_string_lossy().to_string()
    }

    /// A project of several standalone documents must compile the one you are
    /// editing. The fallback sorts by path length, so without this the folder
    /// below would always compile "b.tex" regardless of what was open.
    #[tokio::test]
    async fn an_open_root_document_is_what_gets_compiled() {
        let dir = std::env::temp_dir().join("le-rootfile-standalone");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let long = write(&dir, "a-much-longer-name.tex", "\\documentclass{article}\\begin{document}A\\end{document}");
        write(&dir, "b.tex", "\\documentclass{article}\\begin{document}B\\end{document}");

        let got = find_root_file(dir.to_string_lossy().to_string(), Some(long.clone()))
            .await
            .unwrap();
        assert_eq!(got, long, "should compile the open document, not the shortest path");
    }

    /// A fragment has no \documentclass, so the root that includes it is found.
    #[tokio::test]
    async fn an_open_fragment_falls_back_to_the_real_root() {
        let dir = std::env::temp_dir().join("le-rootfile-fragment");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir.join("sections")).unwrap();

        let main = write(&dir, "main.tex", "\\documentclass{article}\\begin{document}\\input{sections/intro}\\end{document}");
        let frag = write(&dir.join("sections"), "intro.tex", "Just a fragment, no preamble.");

        let got = find_root_file(dir.to_string_lossy().to_string(), Some(frag))
            .await
            .unwrap();
        assert_eq!(got, main, "a fragment should resolve to the document including it");
    }

    /// With nothing open the heuristic still applies.
    #[tokio::test]
    async fn no_active_file_uses_the_shortest_candidate() {
        let dir = std::env::temp_dir().join("le-rootfile-none");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir.join("sections")).unwrap();

        let main = write(&dir, "main.tex", "\\documentclass{article}\\begin{document}x\\end{document}");
        write(&dir.join("sections"), "appendix.tex", "\\documentclass{article}\\begin{document}y\\end{document}");

        let got = find_root_file(dir.to_string_lossy().to_string(), None).await.unwrap();
        assert_eq!(got, main);
    }
}
