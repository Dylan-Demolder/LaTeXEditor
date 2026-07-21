use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

/// One completion-list entry contributed by a plugin.
///
/// `body` is a Monaco snippet string, so `$1`, `$2` and `${1:default}` mark the
/// tab stops — the same syntax the built-in snippets use.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetDef {
    /// What the user types to summon it.
    pub prefix: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub body: String,
}

/// A plugin is data, not code.
///
/// An earlier draft of this shipped CommonJS entry points that the app was
/// meant to execute. Nothing ever ran them, which was just as well: a plugin
/// evaluated in the webview inherits everything the app can do, including the
/// Tauri IPC surface — it could read the API keys out of settings or write any
/// file on disk. Declaring snippets instead gives the useful half of the
/// feature with no arbitrary execution to sandbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub plugin_type: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    /// Completion entries this plugin adds. Empty is valid — a plugin that
    /// declares nothing simply shows up in the list contributing nothing.
    #[serde(default)]
    pub snippets: Vec<SnippetDef>,
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

/// Scan `~/.latex-editor/plugins` for plugin folders.
///
/// This used to also scan a "bundled" directory resolved from
/// `env!("CARGO_MANIFEST_DIR")` — the path of the source tree at *build* time.
/// That works only on the machine that compiled the binary; on anyone else's
/// it points at a directory that does not exist. There is exactly one plugin
/// location now, and it is one the user can actually reach.
pub async fn scan_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let mut plugins = Vec::new();
    let dir = plugins_dir();

    if !dir.exists() {
        return Ok(plugins);
    }

    let mut entries = fs::read_dir(&dir).await.map_err(|e| e.to_string())?;
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

        // One malformed plugin must not hide every other one. Skip it and
        // carry on rather than failing the whole scan.
        let manifest: PluginManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("skipping plugin at {}: {}", manifest_path.display(), e);
                continue;
            }
        };

        plugins.push(InstalledPlugin {
            id: entry.file_name().to_string_lossy().to_string(),
            manifest,
            path: entry.path().to_string_lossy().to_string(),
            enabled: true, // ponytail: default-on, toggle saved later
        });
    }

    Ok(plugins)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_declarative_plugin_parses() {
        let json = r#"{
            "name": "Physics Snippets",
            "version": "1.0.0",
            "type": "snippets",
            "description": "Common physics equations",
            "author": "LaTeXEditor",
            "snippets": [
                { "prefix": "maxwell", "name": "Maxwell's Equations", "body": "\\begin{align}$1\\end{align}" }
            ]
        }"#;
        let m: PluginManifest = serde_json::from_str(json).expect("must parse");
        assert_eq!(m.snippets.len(), 1);
        assert_eq!(m.snippets[0].prefix, "maxwell");
        // description defaults rather than failing the parse.
        assert_eq!(m.snippets[0].description, "");
    }

    /// The old format had `icon`, `main` and `activation`, and no snippets.
    /// It must still load — it simply contributes nothing.
    #[test]
    fn an_old_style_manifest_still_loads() {
        let json = r#"{
            "name": "Legacy",
            "version": "1.0.0",
            "type": "theme",
            "icon": "art",
            "description": "d",
            "author": "a",
            "main": "index.js",
            "activation": "always"
        }"#;
        let m: PluginManifest = serde_json::from_str(json).expect("old manifests must still parse");
        assert!(m.snippets.is_empty());
    }
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}
