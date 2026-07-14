use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenProjectResult {
    pub root: String,
    pub files: Vec<FileEntry>,
}

#[tauri::command]
pub async fn open_project(project_path: String) -> Result<OpenProjectResult, String> {
    let path = PathBuf::from(&project_path);

    if !path.exists() {
        return Err(format!("Directory not found: {}", project_path));
    }

    let files = scan_directory(&path, 3)
        .await
        .map_err(|e| e.to_string())?;

    Ok(OpenProjectResult {
        root: project_path,
        files,
    })
}

async fn scan_directory(path: &PathBuf, max_depth: u32) -> Result<Vec<FileEntry>, std::io::Error> {
    let mut entries = Vec::new();

    if max_depth == 0 {
        return Ok(entries);
    }

    let mut read_dir = fs::read_dir(path).await?;
    while let Some(entry) = read_dir.next_entry().await? {
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }

        let file_path = entry.path();
        let is_dir = entry.file_type().await?.is_dir();

        let ext = if !is_dir {
            file_path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
        } else {
            None
        };

        let children = if is_dir {
            Some(Box::pin(scan_directory(&file_path, max_depth - 1)).await?)
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            is_dir,
            children,
            extension: ext,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else {
            b.is_dir.cmp(&a.is_dir)
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn read_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .await
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))
}

#[tauri::command]
pub async fn write_file(file_path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&file_path).parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&file_path, content)
        .await
        .map_err(|e| format!("Failed to write file {}: {}", file_path, e))
}

#[tauri::command]
pub async fn delete_file(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.is_dir() {
        fs::remove_dir_all(&path)
            .await
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        fs::remove_file(&path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_directory(dir_path: String) -> Result<(), String> {
    fs::create_dir_all(&dir_path)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("Failed to rename: {}", e))
}

#[tauri::command]
pub async fn read_pdf(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path)
        .await
        .map_err(|e| format!("Failed to read PDF: {}", e))
}
