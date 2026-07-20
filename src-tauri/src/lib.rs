mod app_config;
mod commands;
mod git;
mod latex;
mod mcp;
mod plugins;
mod sample;
mod synctex;

use commands::ai_stream::AiCancel;
use commands::{ai_stream, compile, features, plugin, project, settings};
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
        .manage(AiCancel::default())
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
            ai_stream::call_ai_stream,
            ai_stream::cancel_ai,
            sample::ensure_sample_project,
            settings::load_settings,
            settings::save_settings,
            features::git_status,
            features::git_init,
            features::git_add,
            features::git_commit,
            features::git_push,
            features::git_pull,
            features::git_diff,
            features::git_checkout,
            features::synctex_forward,
            features::synctex_inverse,
            features::find_root_file,
            features::get_dependencies,
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
    // Assign unconditionally: `None` means "no project / no file open", and
    // guarding on Some() left agents pointed at a project the user had closed.
    *state.project_path.lock().await = project_path;
    *state.active_file.lock().await = active_file;
    Ok(())
}

#[tauri::command]
async fn get_mcp_status(state: tauri::State<'_, Arc<McpState>>) -> Result<serde_json::Value, String> {
    let running = state.listening.load(std::sync::atomic::Ordering::Relaxed);
    let port = state.port.load(std::sync::atomic::Ordering::Relaxed);

    Ok(serde_json::json!({
        "port": port,
        "running": running,
        "endpoint": format!("http://127.0.0.1:{}/mcp", port),
        "sse_endpoint": format!("http://127.0.0.1:{}/mcp/sse", port),
    }))
}
