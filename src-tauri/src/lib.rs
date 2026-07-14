mod commands;
mod latex;

use commands::{compile, project};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
