mod freetube;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Gives the webview a fetch that goes through Rust's HTTP stack, which
        // is not subject to the webview's CORS enforcement. This is what lets
        // youtubei.js talk to YouTube directly (see src/plugins/youtubejs/).
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            freetube::freetube_scan,
            freetube::freetube_read_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
