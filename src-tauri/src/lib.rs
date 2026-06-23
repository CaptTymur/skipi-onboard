// Skipi On Board — Job Reporter (vessel side).
//
// Thin Tauri v2 shell. The whole capture/submit workflow lives in
// dist/index.html and talks to skipi-server over HTTP (fetch), so the MVP
// needs no custom Rust commands yet. When offline .eml packaging and the
// transfer to the ship's comms PC land, add #[tauri::command] functions
// here (mirror skipi-crewing/src-tauri/src/{api,db}.rs).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running Skipi On Board");
}
