use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      #[cfg(debug_assertions)]
      {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Spawn Node.js backend sidecar
      let shell = app.handle().shell();
      if let Ok(sidecar) = shell.sidecar("wt-live-manager-backend") {
        if let Ok((_rx, _child)) = sidecar.spawn() {
          println!("Backend sidecar spawned successfully.");
        } else {
          eprintln!("Failed to spawn backend sidecar.");
        }
      } else {
        eprintln!("Failed to resolve sidecar configuration.");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
