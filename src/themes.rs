//! Local theme files and URL themes (fetched by the host so page CSP/CORS never matters).
use crate::{paths, store};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::io::Read;
use std::time::{Duration, SystemTime};
use std::{collections::HashMap, fs};

const MAX_CSS: u64 = 2 * 1024 * 1024;

pub fn url_id(url: &str) -> String { format!("u-{}", &store::sha256_hex(url.as_bytes())[..10]) }

fn cache_path(id: &str) -> std::path::PathBuf { paths::cache().join(format!("theme-{id}.css")) }

pub fn http_get(url: &str, etag: Option<&str>) -> Result<Option<(String, Option<String>)>> {
    if !(url.starts_with("https://") || url.starts_with("http://")) { bail!("only http(s) URLs are supported") }
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(15)).redirects(4).build();
    let mut req = agent.get(url);
    if let Some(t) = etag { req = req.set("If-None-Match", t); }
    match req.call() {
        Ok(resp) => {
            let tag = resp.header("ETag").map(|s| s.to_string());
            let mut buf = vec![];
            resp.into_reader().take(MAX_CSS + 1).read_to_end(&mut buf)?;
            if buf.len() as u64 > MAX_CSS { bail!("theme larger than 2 MB") }
            Ok(Some((String::from_utf8_lossy(&buf).into_owned(), tag)))
        }
        Err(ureq::Error::Status(304, _)) => Ok(None),
        Err(e) => Err(anyhow!("{e}")),
    }
}

/// First fetch of a user-added URL.
pub fn add_url(url: &str) -> Result<Value> {
    let (css, etag) = http_get(url, None)?.ok_or_else(|| anyhow!("empty response"))?;
    let id = url_id(url);
    let _ = fs::write(cache_path(&id), &css);
    let name = url.rsplit('/').next().unwrap_or("theme").trim_end_matches(".css").to_string();
    Ok(json!({ "id": id, "name": name, "url": url, "css": css, "etag": etag, "enabled": true, "updated": paths::now() }))
}

pub fn remove_url(id: &str) { let _ = fs::remove_file(cache_path(id)); }

fn local_files() -> Vec<(String, std::path::PathBuf)> {
    let mut v = vec![];
    if let Ok(rd) = fs::read_dir(paths::themes()) {
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if p.is_file() && name.ends_with(".css") {
                let stem = name.trim_end_matches(".css").trim_end_matches(".theme").to_string();
                if paths::valid_id(&stem) { v.push((stem, p)); }
            }
        }
    }
    v
}

/// Build the page's theme list: configured themes (css filled in), plus newly discovered local files (disabled).
pub fn assemble(cfg_themes: &Value) -> Vec<Value> {
    let mut out: Vec<Value> = vec![];
    let locals = local_files();
    for t in cfg_themes.as_array().cloned().unwrap_or_default() {
        let mut t = t;
        let id = t["id"].as_str().unwrap_or("").to_string();
        if t["builtin"] == true { out.push(t); continue } // CSS lives in the core, nothing on disk
        if let Some(url) = t["url"].as_str() {
            let _ = url;
            t["css"] = json!(fs::read_to_string(cache_path(&id)).unwrap_or_default());
        } else if let Some((_, p)) = locals.iter().find(|(s, _)| *s == id) {
            t["css"] = json!(fs::read_to_string(p).unwrap_or_default());
            t["file"] = json!(p.file_name().unwrap().to_string_lossy());
        } else { continue } // local file was deleted
        out.push(t);
    }
    for (stem, p) in locals {
        if out.iter().any(|t| t["id"] == stem) { continue }
        out.push(json!({ "id": stem, "name": stem, "enabled": false, "file": p.file_name().unwrap().to_string_lossy(), "css": fs::read_to_string(&p).unwrap_or_default() }));
    }
    out
}

/// Change detection state for the poller.
#[derive(Default)]
pub struct Watch { pub local: HashMap<String, (SystemTime, u64)>, pub etags: HashMap<String, String>, pub seeded: bool }

/// Returns theme entries (for `theme.update`) whose local file changed since last call.
pub fn local_changes(w: &mut Watch) -> Vec<Value> {
    let mut out = vec![];
    for (id, p) in local_files() {
        let Ok(md) = fs::metadata(&p) else { continue };
        let stamp = (md.modified().unwrap_or(SystemTime::UNIX_EPOCH), md.len());
        if w.local.insert(id.clone(), stamp) != Some(stamp) && w.seeded {
            out.push(json!({ "id": id, "name": id, "file": p.file_name().unwrap().to_string_lossy(), "css": fs::read_to_string(&p).unwrap_or_default(), "updated": paths::now(), "enabled": false }));
        }
    }
    w.seeded = true;
    out
}

/// Network refresh of URL themes (run on a worker thread).
pub fn refresh_urls(themes: &Value, etags: &HashMap<String, String>) -> Vec<(Value, Option<String>)> {
    let mut out = vec![];
    for t in themes.as_array().cloned().unwrap_or_default() {
        let (Some(url), Some(id)) = (t["url"].as_str(), t["id"].as_str()) else { continue };
        match http_get(url, etags.get(id).map(|s| s.as_str())) {
            Ok(Some((css, tag))) => { let _ = fs::write(cache_path(id), &css); out.push((json!({ "id": id, "name": t["name"], "url": url, "css": css, "updated": paths::now(), "error": null, "enabled": t["enabled"] }), tag)); }
            Ok(None) => {}
            Err(e) => out.push((json!({ "id": id, "name": t["name"], "url": url, "error": e.to_string(), "enabled": t["enabled"] }), None)),
        }
    }
    out
}
