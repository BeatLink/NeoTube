//! Media segment proxy.
//!
//! DASH playback needs adaptive (video-only + audio-only) streams, because
//! YouTube stops muxing above 360p. dash.js fetches those segments with
//! `XMLHttpRequest` from inside the webview, and `googlevideo.com` — while happy
//! to *serve* cross-origin requests — sends no `Access-Control-Allow-Origin`
//! header, so the webview blocks the response before JS can read it.
//!
//! This proxies segments through Rust, where CORS does not apply, and adds the
//! headers the webview wants. `Range` is forwarded so seeking and dash.js's
//! byte-range segment requests keep working.

use tauri::{
    http::{Method, Request, Response, StatusCode},
    UriSchemeContext, UriSchemeResponder,
};

/// Custom scheme the frontend rewrites segment URLs to. See `toDashManifest()`
/// in `src/plugins/youtubejs/innertube.ts`.
pub const SCHEME: &str = "ytstream";

/// Hosts this proxy will fetch from. Segment URLs are attacker-influenced in the
/// sense that they come from a parsed API response, so we don't proxy anything
/// the app didn't intend to.
fn is_allowed_host(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    match parsed.host_str() {
        Some(host) => {
            host == "www.youtube.com"
                || host.ends_with(".googlevideo.com")
                || host.ends_with(".ytimg.com")
        }
        None => false,
    }
}

/// Extracts the upstream URL from `ytstream://localhost/?url=<percent-encoded>`.
fn target_url(request: &Request<Vec<u8>>) -> Option<String> {
    let uri = request.uri().to_string();
    let query = uri.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("url=") {
            return percent_encoding::percent_decode_str(value)
                .decode_utf8()
                .ok()
                .map(|s| s.into_owned());
        }
    }
    None
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn handle<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // The webview preflights before issuing a ranged GET.
    if request.method() == Method::OPTIONS {
        let response = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            .header("Access-Control-Allow-Headers", "range, content-type")
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new()));
        responder.respond(response);
        return;
    }

    let Some(url) = target_url(&request) else {
        responder.respond(error(StatusCode::BAD_REQUEST));
        return;
    };

    if !is_allowed_host(&url) {
        responder.respond(error(StatusCode::FORBIDDEN));
        return;
    }

    // Forward the Range header so seeking and segment requests work.
    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let mut upstream = client.get(&url);
        if let Some(range) = range {
            upstream = upstream.header("Range", range);
        }

        let result = async {
            let response = upstream.send().await?;
            let status = response.status();
            let headers = response.headers().clone();
            let body = response.bytes().await?;
            Ok::<_, reqwest::Error>((status, headers, body))
        }
        .await;

        let response = match result {
            Ok((status, headers, body)) => {
                let mut builder = Response::builder()
                    .status(status)
                    // The header googlevideo omits and the webview requires.
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Expose-Headers", "*");

                // Preserve the headers dash.js relies on for ranged playback.
                for name in [
                    "content-type",
                    "content-length",
                    "content-range",
                    "accept-ranges",
                ] {
                    if let Some(value) = headers.get(name) {
                        builder = builder.header(name, value);
                    }
                }

                builder
                    .body(body.to_vec())
                    .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR))
            }
            Err(_) => error(StatusCode::BAD_GATEWAY),
        };

        responder.respond(response);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_youtube_media_hosts() {
        assert!(is_allowed_host("https://rr3---sn-abc.googlevideo.com/videoplayback?x=1"));
        assert!(is_allowed_host("https://www.youtube.com/api/timedtext?v=1"));
        assert!(is_allowed_host("https://i.ytimg.com/vi/abc/hq.jpg"));
    }

    #[test]
    fn rejects_other_hosts_and_schemes() {
        assert!(!is_allowed_host("https://evil.example.com/payload"));
        assert!(!is_allowed_host("http://rr3.googlevideo.com/x"));
        assert!(!is_allowed_host("file:///etc/passwd"));
        assert!(!is_allowed_host("not a url"));
        // Suffix matching must not be fooled by a lookalike domain.
        assert!(!is_allowed_host("https://notgooglevideo.com/x"));
        assert!(!is_allowed_host("https://googlevideo.com.evil.test/x"));
    }

    fn request_with_uri(uri: &str) -> Request<Vec<u8>> {
        Request::builder().uri(uri).body(Vec::new()).unwrap()
    }

    #[test]
    fn extracts_and_decodes_target_url() {
        let req = request_with_uri(
            "ytstream://localhost/?url=https%3A%2F%2Frr3.googlevideo.com%2Fvideoplayback%3Fitag%3D137",
        );
        assert_eq!(
            target_url(&req).as_deref(),
            Some("https://rr3.googlevideo.com/videoplayback?itag=137")
        );
    }

    #[test]
    fn missing_url_parameter_yields_none() {
        assert_eq!(target_url(&request_with_uri("ytstream://localhost/")), None);
    }
}
