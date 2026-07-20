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

    // ---- Editor -------------------------------------------------------
    #[serde(rename = "editorFontSize", default = "default_font_size")]
    pub editor_font_size: u16,
    #[serde(rename = "editorLineHeight", default = "default_line_height")]
    pub editor_line_height: u16,
    #[serde(rename = "editorTabSize", default = "default_tab_size")]
    pub editor_tab_size: u16,
    #[serde(rename = "editorWordWrap", default = "default_true")]
    pub editor_word_wrap: bool,
    #[serde(rename = "editorLineNumbers", default = "default_true")]
    pub editor_line_numbers: bool,
    #[serde(rename = "editorMinimap", default)]
    pub editor_minimap: bool,
    /// Autosave debounce. 0 disables autosave entirely, for people who would
    /// rather decide for themselves when a file is written.
    #[serde(rename = "autosaveDelayMs", default = "default_autosave_delay")]
    pub autosave_delay_ms: u32,

    // ---- Compilation --------------------------------------------------
    /// Empty means "first one found", which is what the app did before this
    /// was configurable.
    #[serde(rename = "defaultCompiler", default)]
    pub default_compiler: String,

    // ---- Preview ------------------------------------------------------
    /// "fit-width" | "fit-page" | a percentage as a string, e.g. "120".
    #[serde(rename = "defaultPreviewZoom", default = "default_preview_zoom")]
    pub default_preview_zoom: String,

    // ---- Onboarding ---------------------------------------------------
    /// Offer the tutorial on launch. Separate from `first_run_completed` so
    /// someone can deliberately turn the offer back on without the app
    /// treating them as a brand-new user.
    #[serde(rename = "offerTutorialOnLaunch", default = "default_true")]
    pub offer_tutorial_on_launch: bool,
}

fn default_true() -> bool {
    true
}
fn default_font_size() -> u16 {
    14
}
fn default_line_height() -> u16 {
    22
}
fn default_tab_size() -> u16 {
    2
}
fn default_autosave_delay() -> u32 {
    1000
}
fn default_preview_zoom() -> String {
    "fit-width".to_string()
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
            editor_font_size: default_font_size(),
            editor_line_height: default_line_height(),
            editor_tab_size: default_tab_size(),
            editor_word_wrap: true,
            editor_line_numbers: true,
            editor_minimap: false,
            autosave_delay_ms: default_autosave_delay(),
            default_compiler: String::new(),
            default_preview_zoom: default_preview_zoom(),
            offer_tutorial_on_launch: true,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Every field carries a serde default, so a settings file written by an
    /// older build must still load — losing someone's API keys because a new
    /// preference was added would be an unforgivable upgrade.
    #[test]
    fn settings_from_an_older_build_still_load() {
        let old = r#"{
            "activeProvider": "opencode-go",
            "activeModel": "deepseek-v4-flash",
            "apiKeys": { "opencode-go": "test-key" },
            "temperature": 0.7,
            "maxTokens": 16384,
            "theme": "light",
            "autocompile": true,
            "mcpPort": 9876,
            "firstRunCompleted": true
        }"#;

        let parsed: AppSettings = serde_json::from_str(old).expect("old settings must parse");
        assert_eq!(parsed.active_provider, "opencode-go");
        assert_eq!(parsed.api_keys.get("opencode-go").unwrap(), "test-key");
        assert!(parsed.first_run_completed);
        // Fields the old file never had come back as their defaults.
        assert_eq!(parsed.editor_font_size, 14);
        assert!(parsed.editor_word_wrap);
        assert_eq!(parsed.autosave_delay_ms, 1000);
        assert_eq!(parsed.default_preview_zoom, "fit-width");
        assert!(parsed.offer_tutorial_on_launch);
    }

    /// An empty file is a real state — it is what a corrupted or truncated
    /// write leaves behind, and it must not wedge the app.
    #[test]
    fn an_empty_object_yields_defaults() {
        let parsed: AppSettings = serde_json::from_str("{}").expect("empty object must parse");
        assert_eq!(parsed.active_provider, default_active_provider());
        assert_eq!(parsed.editor_tab_size, 2);
    }

    #[test]
    fn round_trips_through_json() {
        let mut settings = AppSettings::default();
        settings.editor_font_size = 18;
        settings.default_compiler = "xelatex".to_string();
        let text = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&text).unwrap();
        assert_eq!(back.editor_font_size, 18);
        assert_eq!(back.default_compiler, "xelatex");
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
