use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub plugin_type: String,
    pub icon: String,
    pub description: String,
    pub author: String,
    pub main: String,
    #[serde(default)]
    pub activation: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstalledPlugin {
    pub id: String,
    pub manifest: PluginManifest,
    pub path: String,
    pub enabled: bool,
}

fn plugins_dir() -> PathBuf {
    let home = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    let dir = home.join(".latex-editor").join("plugins");
    dir
}

fn bundled_plugins_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("plugins")
}

pub async fn scan_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let mut plugins = Vec::new();

    let dirs = [plugins_dir(), bundled_plugins_dir()];

    for dir in &dirs {
        if !dir.exists() {
            continue;
        }

        let mut entries = fs::read_dir(dir).await.map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            if !entry.file_type().await.map_err(|e| e.to_string())?.is_dir() {
                continue;
            }

            let manifest_path = entry.path().join("plugin.json");
            if !manifest_path.exists() {
                continue;
            }

            let content = fs::read_to_string(&manifest_path)
                .await
                .map_err(|e| e.to_string())?;

            let manifest: PluginManifest =
                serde_json::from_str(&content).map_err(|e| e.to_string())?;

            let folder_name = entry.file_name().to_string_lossy().to_string();

            plugins.push(InstalledPlugin {
                id: folder_name.clone(),
                manifest,
                path: entry.path().to_string_lossy().to_string(),
                enabled: true, // ponytail: default-on, toggle saved later
            });
        }
    }

    Ok(plugins)
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}
