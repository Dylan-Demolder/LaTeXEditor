use crate::plugins::manager::{scan_plugins, InstalledPlugin};
use std::path::PathBuf;
use tokio::fs;

#[tauri::command]
pub async fn list_plugins() -> Result<Vec<InstalledPlugin>, String> {
    scan_plugins().await
}

#[tauri::command]
pub async fn get_plugin(plugin_id: String) -> Result<Option<InstalledPlugin>, String> {
    let plugins = scan_plugins().await?;
    Ok(plugins.into_iter().find(|p| p.id == plugin_id))
}

#[tauri::command]
pub async fn read_plugin_file(plugin_path: String, file_name: String) -> Result<String, String> {
    let path = PathBuf::from(&plugin_path).join(&file_name);
    fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read plugin file {}: {}", path.display(), e))
}

#[tauri::command]
pub async fn get_plugin_assets(plugin_path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&plugin_path);
    let mut assets = Vec::new();

    if !path.exists() {
        return Ok(assets);
    }

    let mut entries = fs::read_dir(&path).await.map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().to_string();
        if name != "plugin.json" &&
           name != "index.js" &&
           !name.starts_with('.')
        {
            assets.push(name);
        }
    }

    Ok(assets)
}
