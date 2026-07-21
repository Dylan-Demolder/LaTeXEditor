use crate::plugins::manager::{scan_plugins, InstalledPlugin};

/// The whole plugin command surface.
///
/// `read_plugin_file` and `get_plugin_assets` used to live here, to feed a
/// source-code viewer in the plugin manager. Plugins are declarative now, so
/// there is no source to show — and `read_plugin_file` took an arbitrary path
/// and filename straight from the frontend, which with a `..` or two would
/// read any file on disk. An IPC command that broad should not exist without a
/// caller that needs it.
#[tauri::command]
pub async fn list_plugins() -> Result<Vec<InstalledPlugin>, String> {
    scan_plugins().await
}
