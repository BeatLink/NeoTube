//! FreeTube data import.
//!
//! Ported from the Electron main process. The webview has no filesystem access,
//! so scanning for and parsing FreeTube's databases happens here in Rust.

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct FtSubscription {
    id: String,
    name: String,
    thumbnail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FtHistoryEntry {
    video_id: String,
    title: String,
    channel_id: String,
    channel_name: String,
    thumbnail: String,
    duration: i64,
    watched_at: String,
}

#[derive(Serialize)]
pub struct FtData {
    subscriptions: Vec<FtSubscription>,
    history: Vec<FtHistoryEntry>,
}

/// FreeTube's older releases write NDJSON (one JSON object per line); newer ones
/// write a single JSON array. Accept both.
fn parse_db(raw: &str) -> Vec<Value> {
    let trimmed = raw.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return match value {
            Value::Array(items) => items,
            other => vec![other],
        };
    }
    trimmed
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .collect()
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".config").join("FreeTube"));
        dirs.push(
            home.join(".var")
                .join("app")
                .join("io.freetubeapp.FreeTube")
                .join("config")
                .join("FreeTube"),
        );
        dirs.push(
            home.join("snap")
                .join("freetube")
                .join("current")
                .join(".config")
                .join("FreeTube"),
        );
        dirs.push(home.join("AppData").join("Roaming").join("FreeTube"));
        dirs.push(
            home.join("Library")
                .join("Application Support")
                .join("FreeTube"),
        );
    }
    dirs
}

/// Returns the well-known FreeTube data directories that actually exist.
#[tauri::command]
pub fn freetube_scan() -> Vec<String> {
    candidate_dirs()
        .into_iter()
        .filter(|dir| dir.join("profiles.db").is_file())
        .map(|dir| dir.to_string_lossy().into_owned())
        .collect()
}

fn read_subscriptions(dir: &Path) -> Vec<FtSubscription> {
    let Ok(raw) = std::fs::read_to_string(dir.join("profiles.db")) else {
        return Vec::new();
    };

    let mut seen = std::collections::HashSet::new();
    let mut subscriptions = Vec::new();

    for profile in parse_db(&raw) {
        let Some(subs) = profile.get("subscriptions").and_then(Value::as_array) else {
            continue;
        };
        for sub in subs {
            let (Some(id), Some(name)) = (
                sub.get("id").and_then(Value::as_str),
                sub.get("name").and_then(Value::as_str),
            ) else {
                continue;
            };
            if !seen.insert(id.to_string()) {
                continue;
            }
            subscriptions.push(FtSubscription {
                id: id.to_string(),
                name: name.to_string(),
                thumbnail: sub
                    .get("thumbnail")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            });
        }
    }
    subscriptions
}

fn read_history(dir: &Path) -> Vec<FtHistoryEntry> {
    let Ok(raw) = std::fs::read_to_string(dir.join("history.db")) else {
        return Vec::new();
    };

    parse_db(&raw)
        .into_iter()
        .filter_map(|entry| {
            let video_id = entry
                .get("videoId")
                .or_else(|| entry.get("id"))
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())?
                .to_string();

            let thumbnail = entry
                .get("videoThumbnails")
                .and_then(Value::as_array)
                .and_then(|thumbs| thumbs.first())
                .and_then(|t| t.get("url"))
                .and_then(Value::as_str)
                .filter(|url| !url.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
                });

            // timeWatched is a Unix timestamp in milliseconds.
            let watched_at = entry
                .get("timeWatched")
                .and_then(Value::as_i64)
                .and_then(unix_millis_to_iso8601)
                .unwrap_or_else(now_iso8601);

            Some(FtHistoryEntry {
                video_id,
                title: str_field(&entry, "title"),
                channel_id: str_field(&entry, "authorId"),
                channel_name: str_field(&entry, "author"),
                thumbnail,
                duration: entry
                    .get("lengthSeconds")
                    .and_then(Value::as_i64)
                    .unwrap_or(0),
                watched_at,
            })
        })
        .collect()
}

fn str_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Formats a Unix millisecond timestamp as an ISO-8601 UTC string.
fn unix_millis_to_iso8601(millis: i64) -> Option<String> {
    let time = std::time::UNIX_EPOCH.checked_add(std::time::Duration::from_millis(
        u64::try_from(millis).ok()?,
    ))?;
    Some(format_system_time(time))
}

fn now_iso8601() -> String {
    format_system_time(std::time::SystemTime::now())
}

/// Minimal civil-from-days conversion so we don't pull in a date crate for one
/// timestamp format. Algorithm from Howard Hinnant's `civil_from_days`.
fn format_system_time(time: std::time::SystemTime) -> String {
    let secs = time
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let days = secs.div_euclid(86_400);
    let time_of_day = secs.rem_euclid(86_400);
    let (hour, minute, second) = (
        time_of_day / 3600,
        (time_of_day % 3600) / 60,
        time_of_day % 60,
    );

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

/// Reads and parses `profiles.db` and `history.db` from a FreeTube data directory.
#[tauri::command]
pub fn freetube_read_data(dir: String) -> FtData {
    let dir = PathBuf::from(dir);
    FtData {
        subscriptions: read_subscriptions(&dir),
        history: read_history(&dir),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_array_and_ndjson() {
        assert_eq!(parse_db(r#"[{"a":1},{"a":2}]"#).len(), 2);
        assert_eq!(parse_db("{\"a\":1}\n{\"a\":2}").len(), 2);
        assert_eq!(parse_db(r#"{"a":1}"#).len(), 1);
    }

    #[test]
    fn formats_unix_epoch() {
        assert_eq!(
            unix_millis_to_iso8601(0).unwrap(),
            "1970-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn formats_known_timestamp() {
        // 2021-01-01T00:00:00Z
        assert_eq!(
            unix_millis_to_iso8601(1_609_459_200_000).unwrap(),
            "2021-01-01T00:00:00.000Z"
        );
    }
}
