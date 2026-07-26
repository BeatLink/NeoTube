mod freetube;
mod stream;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Gives the webview a fetch that goes through Rust's HTTP stack, which
        // is not subject to the webview's CORS enforcement. This is what lets
        // youtubei.js talk to YouTube directly (see src/plugins/youtubejs/).
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        // Proxies DASH media segments so dash.js can read them; googlevideo
        // serves cross-origin requests but sends no CORS headers.
        .register_asynchronous_uri_scheme_protocol(stream::SCHEME, stream::handle)
        .invoke_handler(tauri::generate_handler![
            freetube::freetube_scan,
            freetube::freetube_read_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
