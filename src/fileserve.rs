//! Loopback file server for wallpapers: serves only files the user explicitly configured, behind an unguessable token.
use crate::paths;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

struct State { port: u16, files: Mutex<HashMap<String, PathBuf>> }
static STATE: OnceLock<Arc<State>> = OnceLock::new();

fn mime(p: &std::path::Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "avif" => "image/avif",
        "mp4" | "m4v" => "video/mp4", "webm" => "video/webm", "mkv" => "video/x-matroska", _ => "application/octet-stream",
    }
}

fn state() -> &'static Arc<State> {
    STATE.get_or_init(|| {
        let l = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
        let port = l.local_addr().unwrap().port();
        let st = Arc::new(State { port, files: Mutex::new(HashMap::new()) });
        let s2 = st.clone();
        std::thread::spawn(move || for c in l.incoming().flatten() { let s = s2.clone(); std::thread::spawn(move || { let _ = handle(c, &s); }); });
        st
    })
}

/// Register a file and return its URL.
pub fn serve(path: &str) -> Result<String, String> {
    let p = PathBuf::from(path);
    let ext_ok = matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "mp4" | "m4v" | "webm" | "mkv"));
    if !ext_ok { return Err("only image and video files can be served".into()) }
    if !p.is_file() { return Err(format!("file not found: {path}")) }
    let st = state();
    let token = hex::encode(&Sha256::digest(format!("{}{}{:?}", paths::now(), path, std::time::Instant::now()))[..12]);
    st.files.lock().unwrap().insert(token.clone(), p.clone());
    Ok(format!("http://127.0.0.1:{}/f/{}/{}", st.port, token, p.file_name().unwrap().to_string_lossy().replace(' ', "_")))
}

fn handle(mut c: TcpStream, st: &State) -> std::io::Result<()> {
    let mut rd = BufReader::new(c.try_clone()?);
    let mut line = String::new();
    rd.read_line(&mut line)?;
    let mut range: Option<(u64, Option<u64>)> = None;
    loop {
        let mut h = String::new();
        if rd.read_line(&mut h)? == 0 || h.trim().is_empty() { break }
        if let Some(v) = h.to_lowercase().strip_prefix("range: bytes=") {
            let mut it = v.trim().splitn(2, '-');
            if let (Some(a), b) = (it.next().and_then(|s| s.parse().ok()), it.next().and_then(|s| s.parse().ok())) { range = Some((a, b)); }
        }
    }
    let path = line.split_whitespace().nth(1).unwrap_or("");
    let token = path.strip_prefix("/f/").and_then(|r| r.split('/').next()).unwrap_or("");
    let Some(file) = st.files.lock().unwrap().get(token).cloned() else { return c.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n") };
    let mut f = File::open(&file)?;
    let len = f.metadata()?.len();
    let (start, end, status) = match range { Some((a, b)) if a < len => (a, b.unwrap_or(len - 1).min(len - 1), "206 Partial Content"), _ => (0, len.saturating_sub(1), "200 OK") };
    let n = if len == 0 { 0 } else { end - start + 1 };
    write!(c, "HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {n}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n", mime(&file))?;
    if status.starts_with("206") { write!(c, "Content-Range: bytes {start}-{end}/{len}\r\n")?; }
    c.write_all(b"\r\n")?;
    f.seek(SeekFrom::Start(start))?;
    std::io::copy(&mut f.take(n), &mut c)?;
    Ok(())
}
