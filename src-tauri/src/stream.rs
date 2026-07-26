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

/// Size of the range requested when the caller supplies none. Large enough to
/// cover an init segment, small enough not to pull a whole file.
const INITIAL_RANGE_BYTES: u64 = 1024 * 1024;

/// True for `bytes=N-M`. An open-ended `bytes=N-` is rejected by googlevideo
/// just like a missing header, so it does not count as bounded.
fn is_bounded_range(value: &str) -> bool {
    value
        .strip_prefix("bytes=")
        .and_then(|r| r.split_once('-'))
        .is_some_and(|(start, end)| !start.is_empty() && !end.is_empty())
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Shared HTTP client for segment fetches.
///
/// A video pulls hundreds of segments, so building a client per request would
/// discard the connection pool and repeat the TLS handshake every time —
/// wasteful, and a likely source of the intermittent fetch failures that made
/// dash.js drop to progressive playback.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // Long enough for a slow segment, short enough that a dead
            // connection doesn't stall the player indefinitely.
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_default()
    })
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
    //
    // googlevideo rejects a request with no bounded range: both a missing
    // `Range` header and an open-ended `bytes=N-` return 403, even though the
    // URL is otherwise valid. dash.js issues exactly such a request when it
    // fetches an init segment via the `&range=` query parameter, so supply a
    // bounded header when neither form is present.
    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .filter(|value| is_bounded_range(value))
        .map(str::to_owned)
        .or_else(|| {
            if url.contains("&range=") || url.contains("?range=") {
                None
            } else {
                Some(format!("bytes=0-{}", INITIAL_RANGE_BYTES - 1))
            }
        });

    let logged_range = range.clone();

    tauri::async_runtime::spawn(async move {
        let mut upstream = http_client().get(&url);
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
                if !status.is_success() {
                    // Kept deliberately: a 403 here means googlevideo rejected
                    // the request, which is the only failure mode seen so far
                    // and is otherwise invisible from the webview console.
                    eprintln!(
                        "[ytstream] upstream {} range={:?} itag={:?}",
                        status,
                        logged_range,
                        url.split("itag=").nth(1).and_then(|s| s.split('&').next()),
                    );
                }
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
            Err(e) => {
                eprintln!("[ytstream] upstream request failed: {e}");
                error(StatusCode::BAD_GATEWAY)
            }
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
    fn recognises_bounded_ranges() {
        assert!(is_bounded_range("bytes=0-1023"));
        assert!(is_bounded_range("bytes=500-999"));
    }

    // googlevideo 403s on these exactly as it does on a missing header, so they
    // must not be treated as usable.
    #[test]
    fn rejects_open_ended_and_malformed_ranges() {
        assert!(!is_bounded_range("bytes=0-"));
        assert!(!is_bounded_range("bytes=-500"));
        assert!(!is_bounded_range("bytes="));
        assert!(!is_bounded_range("0-1023"));
        assert!(!is_bounded_range(""));
    }

    #[test]
    fn missing_url_parameter_yields_none() {
        assert_eq!(target_url(&request_with_uri("ytstream://localhost/")), None);
    }
}
