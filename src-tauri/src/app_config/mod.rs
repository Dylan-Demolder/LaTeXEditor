use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(rename = "activeProvider", default = "default_active_provider")]
    pub active_provider: String,
    #[serde(rename = "activeModel", default = "default_active_model")]
    pub active_model: String,
    #[serde(rename = "apiKeys", default)]
    pub api_keys: HashMap<String, String>,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(rename = "maxTokens", default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub autocompile: bool,
    #[serde(rename = "mcpPort", default = "default_mcp_port")]
    pub mcp_port: u16,
    /// Set once the guide has been offered, so it opens on first launch only.
    #[serde(rename = "firstRunCompleted", default)]
    pub first_run_completed: bool,
    /// Ask the model not to deliberate before answering. Skills work on short
    /// passages where thinking costs multiples of the latency for the same edit.
    #[serde(rename = "reduceReasoning", default = "default_reduce_reasoning")]
    pub reduce_reasoning: bool,
}

fn default_reduce_reasoning() -> bool {
    true
}

fn default_active_provider() -> String {
    "openai".to_string()
}
fn default_active_model() -> String {
    "gpt-4o-mini".to_string()
}
fn default_temperature() -> f64 {
    0.7
}
fn default_max_tokens() -> u32 {
    16384
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_mcp_port() -> u16 {
    9876
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            active_provider: default_active_provider(),
            active_model: default_active_model(),
            api_keys: HashMap::new(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            theme: default_theme(),
            autocompile: false,
            mcp_port: default_mcp_port(),
            first_run_completed: false,
            reduce_reasoning: default_reduce_reasoning(),
        }
    }
}

fn settings_path() -> PathBuf {
    let home = dirs_home();
    home.join(".latex-editor").join("settings.json")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub async fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if path.exists() {
        let content = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    } else {
        Ok(AppSettings::default())
    }
}

pub async fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create settings dir: {}", e))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content)
        .await
        .map_err(|e| format!("Failed to write settings: {}", e))
}
