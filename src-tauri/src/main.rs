// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux/WebKitGTK on NVIDIA: the DMABUF renderer can leave the window blank.
    // Disable it before GTK initializes, unless the user already set the var.
    // Mirrors the same fix in Skipi Seafarer / Broker / Crewing.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    app_lib::run();
}
