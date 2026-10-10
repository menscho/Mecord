use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static ROOT: OnceLock<PathBuf> = OnceLock::new();

/// `%AppData%\Mecord` (or `MECORD_HOME` for tests).
pub fn root() -> &'static Path {
    ROOT.get_or_init(|| {
        let p = std::env::var_os("MECORD_HOME").map(PathBuf::from).unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("APPDATA").unwrap_or_else(|| ".".into())).join("Mecord")
        });
        let _ = fs::create_dir_all(&p);
        p
    })
}

pub fn sub(name: &str) -> PathBuf {
    let p = root().join(name);
    let _ = fs::create_dir_all(&p);
    p
}
pub fn plugins() -> PathBuf { sub("plugins") }
pub fn userplugins() -> PathBuf { sub("userplugins") }
pub fn themes() -> PathBuf { sub("themes") }
pub fn journal() -> PathBuf { sub("journal") }
pub fn cache() -> PathBuf { sub("cache") }
pub fn backups() -> PathBuf { sub("backups") }
pub fn storage() -> PathBuf { sub("storage") }
pub fn logs() -> PathBuf { sub("logs") }

pub fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

pub fn log(level: &str, msg: &str) {
    // Milliseconds, so startup timing in the log can be read.
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let line = format!("{}.{:03} [{}] {}\n", d.as_secs(), d.subsec_millis(), level, msg);
    #[cfg(debug_assertions)]
    print!("{line}");
    let path = logs().join("mecord.log");
    // Keep the log bounded.
    if fs::metadata(&path).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = fs::rename(&path, logs().join("mecord.old.log"));
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) { let _ = f.write_all(line.as_bytes()); }
}

/// Write a file atomically: temp file in the same directory, flush to disk, rename over the target.
pub fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)
}

pub fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}
pub fn write_json(path: &Path, v: &Value) -> std::io::Result<()> {
    write_atomic(path, serde_json::to_string_pretty(v).unwrap_or_default().as_bytes())
}

/// Only plain identifiers may name plugins/themes on disk.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.') && !id.starts_with('.')
}
