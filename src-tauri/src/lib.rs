mod app_config;
mod commands;
mod latex;
mod mcp;
mod plugins;

use commands::{compile, plugin, project, settings};
use mcp::server;
use mcp::protocol::McpState;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mcp_state = Arc::new(McpState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::clone(&mcp_state))
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let state = Arc::clone(&mcp_state);
            tauri::async_runtime::spawn(async move {
                server::start_server(9876, state).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            compile::compile_latex,
            compile::check_compilers,
            project::open_project,
            project::read_file,
            project::write_file,
            project::delete_file,
            project::create_directory,
            project::rename_file,
            project::read_pdf,
            set_mcp_project,
            get_mcp_status,
            plugin::list_plugins,
            plugin::get_plugin,
            plugin::read_plugin_file,
            plugin::get_plugin_assets,
            settings::call_ai,
            settings::load_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn set_mcp_project(
    state: tauri::State<'_, Arc<McpState>>,
    project_path: Option<String>,
    active_file: Option<String>,
) -> Result<(), String> {
    if let Some(p) = project_path {
        *state.project_path.lock().await = Some(p);
    }
    if let Some(f) = active_file {
        *state.active_file.lock().await = Some(f);
    }
    Ok(())
}

#[tauri::command]
async fn get_mcp_status() -> serde_json::Value {
    serde_json::json!({
        "port": 9876,
        "running": true,
        "endpoint": "http://127.0.0.1:9876/mcp",
        "sse_endpoint": "http://127.0.0.1:9876/mcp/sse",
    })
}
