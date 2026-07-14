use git2::{Repository, Signature, IndexAddOption, DiffOptions};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub modified: Vec<String>,
    pub staged: Vec<String>,
    pub untracked: Vec<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitDiff {
    pub file: String,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffLine {
    pub origin: String,
    pub content: String,
}

pub fn open_repo(path: &str) -> Result<Repository, String> {
    Repository::open(path).map_err(|e| format!("Not a git repository: {}", e))
}

pub fn get_status(path: &str) -> Result<GitStatus, String> {
    let repo = open_repo(path)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let mut modified = Vec::new();
    let mut staged = Vec::new();
    let mut untracked = Vec::new();

    let statuses = repo
        .statuses(Some(git2::StatusOptions::new().include_untracked(true)))
        .map_err(|e| format!("Status error: {}", e))?;

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let s = entry.status();

        if s.contains(git2::Status::INDEX_NEW)
            || s.contains(git2::Status::INDEX_MODIFIED)
            || s.contains(git2::Status::INDEX_DELETED)
        {
            staged.push(path);
        } else if s.contains(git2::Status::WT_MODIFIED) || s.contains(git2::Status::WT_DELETED) {
            modified.push(path);
        } else if s.contains(git2::Status::WT_NEW) {
            untracked.push(path);
        }
    }

    let mut ahead = 0;
    let mut behind = 0;
    if let Ok(head) = repo.head() {
        if let Ok(local) = head.peel_to_commit() {
            if let Ok(upstream) = repo
                .find_reference(&format!(
                    "refs/remotes/origin/{}",
                    head.shorthand().unwrap_or("main")
                ))
                .and_then(|r| r.peel_to_commit())
            {
                if let Ok((a, b)) = repo.graph_ahead_behind(local.id(), upstream.id()) {
                    ahead = a as usize;
                    behind = b as usize;
                }
            }
        }
    }

    Ok(GitStatus {
        is_repo: true,
        branch,
        modified,
        staged,
        untracked,
        ahead,
        behind,
    })
}

pub fn git_init(path: &str) -> Result<(), String> {
    Repository::init(path).map_err(|e| format!("Init error: {}", e))?;
    Ok(())
}

pub fn git_add(path: &str, files: Vec<String>) -> Result<(), String> {
    let repo = open_repo(path)?;
    let mut index = repo.index().map_err(|e| format!("Index error: {}", e))?;

    if files.is_empty() {
        index
            .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .map_err(|e| format!("Add error: {}", e))?;
    } else {
        for f in &files {
            index
                .add_path(PathBuf::from(f).as_path())
                .map_err(|e| format!("Add error for {}: {}", f, e))?;
        }
    }

    index.write().map_err(|e| format!("Write index: {}", e))?;
    Ok(())
}

pub fn git_commit(path: &str, message: &str) -> Result<String, String> {
    let repo = open_repo(path)?;

    let sig = Signature::now("LaTeXEditor", "latex-editor@local")
        .map_err(|e| format!("Signature: {}", e))?;

    let mut index = repo.index().map_err(|e| format!("Index: {}", e))?;
    let tree_id = index.write_tree().map_err(|e| format!("Tree: {}", e))?;
    let tree = repo.find_tree(tree_id).map_err(|e| format!("Find tree: {}", e))?;

    let head_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parent_refs: Vec<&git2::Commit> = match head_commit.as_ref() {
        Some(c) => vec![c],
        None => vec![],
    };
    let oid = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            parent_refs.as_slice(),
        )
        .map_err(|e| format!("Commit: {}", e))?;

    Ok(oid.to_string())
}

pub fn git_push(path: &str) -> Result<(), String> {
    let repo = open_repo(path)?;
    let mut remote = repo
        .find_remote("origin")
        .map_err(|_| "No remote 'origin' configured".to_string())?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, _username, _allowed| {
        git2::Cred::ssh_key_from_agent("git")
            .or_else(|_| git2::Cred::default())
    });

    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "main".to_string());

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote
        .push(&[&refspec], Some(&mut push_opts))
        .map_err(|e| format!("Push failed: {}", e))?;

    Ok(())
}

pub fn git_pull(path: &str) -> Result<(), String> {
    let repo = open_repo(path)?;
    let mut remote = repo
        .find_remote("origin")
        .map_err(|_| "No remote 'origin' configured".to_string())?;

    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|_url, _username, _allowed| {
        git2::Cred::ssh_key_from_agent("git")
            .or_else(|_| git2::Cred::default())
    });

    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    remote
        .fetch(&["refs/heads/*:refs/remotes/origin/*"], Some(&mut fetch_opts), None)
        .map_err(|e| format!("Fetch failed: {}", e))?;

    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| format!("FETCH_HEAD: {}", e))?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|e| format!("Annotated: {}", e))?;

    let (analysis, _) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("Merge analysis: {}", e))?;

    if analysis.is_fast_forward() {
        let mut reference = repo
            .find_reference("HEAD")
            .map_err(|e| format!("HEAD: {}", e))?;
        reference
            .set_target(fetch_commit.id(), "Fast-forward")
            .map_err(|e| format!("Fast-forward: {}", e))?;
        repo.set_head("HEAD").map_err(|e| format!("Set head: {}", e))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| format!("Checkout: {}", e))?;
    }

    Ok(())
}

pub fn git_log(path: &str, count: usize) -> Result<Vec<GitCommit>, String> {
    let repo = open_repo(path)?;
    let mut revwalk = repo.revwalk().map_err(|e| format!("Revwalk: {}", e))?;
    revwalk.push_head().map_err(|e| format!("Push head: {}", e))?;

    let mut commits = Vec::new();
    for oid in revwalk.take(count) {
        let oid = oid.map_err(|e| format!("OID: {}", e))?;
        let commit = repo.find_commit(oid).map_err(|e| format!("Commit: {}", e))?;
        let time = commit.time().seconds();
        let author = commit.author();
        commits.push(GitCommit {
            hash: oid.to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: author.name().unwrap_or("unknown").to_string(),
            time: chrono_formatted(time),
        });
    }

    Ok(commits)
}

fn chrono_formatted(ts: i64) -> String {
    let secs = ts as u64;
    let hours = (secs / 3600) % 24;
    let minutes = (secs / 60) % 60;
    let sec = secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, sec)
}

pub fn git_diff_file(path: &str, file_path: &str) -> Result<GitDiff, String> {
    let repo = open_repo(path)?;
    let head = repo.head().map_err(|e| format!("HEAD: {}", e))?;
    let head_tree = head.peel_to_tree().map_err(|e| format!("Tree: {}", e))?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.pathspec(file_path);

    let diff = repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut diff_opts))
        .map_err(|e| format!("Diff: {}", e))?;

    let mut output = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        let content = String::from_utf8_lossy(line.content()).to_string();
        output.push(DiffLine { origin: origin.to_string(), content });
        true
    }).map_err(|e| format!("Diff print: {}", e))?;

    Ok(GitDiff {
        file: file_path.to_string(),
        hunks: vec![DiffHunk { old_start: 1, old_lines: 1, new_start: 1, new_lines: 1, lines: output }],
    })
}

pub fn git_branches(path: &str) -> Result<Vec<String>, String> {
    let repo = open_repo(path)?;
    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| format!("Branches: {}", e))?;

    let mut names = Vec::new();
    for b in branches {
        if let Ok((branch, _)) = b {
            if let Ok(Some(name)) = branch.name() {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}

pub fn git_checkout(path: &str, branch: &str) -> Result<(), String> {
    let repo = open_repo(path)?;
    let (object, reference) = repo
        .revparse_ext(branch)
        .map_err(|e| format!("Revparse: {}", e))?;

    repo.checkout_tree(&object, Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| format!("Checkout tree: {}", e))?;

    match reference {
        Some(gref) => repo.set_head(gref.name().unwrap_or("")),
        None => repo.set_head_detached(object.id()),
    }
    .map_err(|e| format!("Set head: {}", e))?;

    Ok(())
}
