//! Plugin discovery: store-installed bundles (verified at install time) and user plugins (compiled on the fly).
use crate::{compile, paths};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub fn installed_map() -> serde_json::Map<String, Value> {
    paths::read_json(&paths::plugins().join("installed.json")).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}
pub fn save_installed(m: &serde_json::Map<String, Value>) -> std::io::Result<()> {
    paths::write_json(&paths::plugins().join("installed.json"), &Value::Object(m.clone()))
}

pub fn store_dir(id: &str, version: &str) -> PathBuf { paths::plugins().join(id).join(version) }

/// Entries for plugins installed from the store.
pub fn store_entries() -> Vec<Value> {
    let mut out = vec![];
    for (id, ver) in installed_map() {
        let Some(ver) = ver.as_str() else { continue };
        let dir = store_dir(&id, ver);
        let (Some(meta), Ok(src)) = (paths::read_json(&dir.join("meta.json")), fs::read_to_string(dir.join("index.js"))) else {
            paths::log("warn", &format!("installed plugin {id}@{ver} is incomplete; skipping"));
            continue;
        };
        let mut e = meta;
        e["origin"] = json!("store");
        e["source"] = json!(src);
        out.push(e);
    }
    out
}

// ---- user plugins ----
const EXTS: [&str; 4] = ["ts", "tsx", "js", "jsx"];

/// (id, entry file, newest mtime + total size of all files that contribute to it)
pub fn user_sources() -> Vec<(String, PathBuf, (SystemTime, u64))> {
    let mut out = vec![];
    let Ok(rd) = fs::read_dir(paths::userplugins()) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "node_modules" { continue; }
        if p.is_file() {
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
            if !EXTS.contains(&ext) { continue; }
            let id = p.file_stem().unwrap().to_string_lossy().into_owned();
            if paths::valid_id(&id) { let st = stamp(&p); out.push((id, p, st)); }
        } else if p.is_dir() && paths::valid_id(&name) {
            let Some(entry) = EXTS.iter().map(|x| p.join(format!("index.{x}"))).find(|f| f.exists()) else { continue };
            out.push((name, entry, dir_stamp(&p, 0)));
        }
    }
    out
}

fn stamp(p: &Path) -> (SystemTime, u64) {
    fs::metadata(p).map(|m| (m.modified().unwrap_or(SystemTime::UNIX_EPOCH), m.len())).unwrap_or((SystemTime::UNIX_EPOCH, 0))
}
fn dir_stamp(dir: &Path, depth: u8) -> (SystemTime, u64) {
    let mut best = (SystemTime::UNIX_EPOCH, 0u64);
    if depth > 3 { return best; }
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.file_name() == "node_modules" { continue; }
            let p = e.path();
            let s = if p.is_dir() { dir_stamp(&p, depth + 1) } else { stamp(&p) };
            if s.0 > best.0 { best.0 = s.0; }
            best.1 += s.1;
        }
    }
    best
}

/// `// @name Foo` or ` * @name Foo` header lines.
fn header_meta(src: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for line in src.lines().take(30) {
        let l = line.trim().trim_start_matches("//").trim_start_matches("/**").trim_start_matches('*').trim();
        if let Some(rest) = l.strip_prefix('@') {
            if let Some((k, v)) = rest.split_once(char::is_whitespace) { m.insert(k.to_string(), v.trim().trim_end_matches("*/").trim().to_string()); }
        }
    }
    m
}

/// Compile a user plugin into a page entry. `Err` carries the compiler message.
pub fn user_entry(id: &str, entry: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(entry).unwrap_or_default();
    let meta = header_meta(&raw);
    let source = compile::compile(entry).map_err(|e| e.to_string())?;
    Ok(json!({
        "id": id,
        "name": meta.get("name").cloned().unwrap_or_else(|| id.to_string()),
        "version": meta.get("version").cloned().unwrap_or_else(|| "local".into()),
        "description": meta.get("description").cloned().unwrap_or_default(),
        "author": meta.get("author").cloned().unwrap_or_default(),
        "category": meta.get("category").cloned().unwrap_or_default(),
        "origin": "user",
        "source": source,
        "native": null,
        "capabilities": [],
    }))
}

/// A stub entry shown when a user plugin fails to compile; evaluates to an error so the UI explains why.
pub fn broken_entry(id: &str, err: &str) -> Value {
    json!({
        "id": id, "name": id, "version": "local", "description": "Failed to compile", "origin": "user",
        "source": format!("throw new Error({});", serde_json::to_string(&format!("compile error: {err}")).unwrap()),
        "native": null, "capabilities": [],
    })
}

pub fn scaffold_user_patch(id: &str, find: &str, mat: &str, replace: &str) -> std::io::Result<PathBuf> {
    let p = paths::userplugins().join(format!("{id}.ts"));
    if p.exists() { return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "a plugin with that name already exists")); }
    let body = format!(
        "// @name {id}\n// @description Created from the Mecord patch editor\n// @version 0.1.0\nimport {{ definePlugin }} from \"@mecord/api\";\n\nexport default definePlugin({{\n  name: {id_s},\n  patches: [{{\n    find: {find},\n    replacement: {{ match: new RegExp({mat}), replace: {rep} }},\n  }}],\n}});\n",
        id_s = serde_json::to_string(id).unwrap(),
        find = serde_json::to_string(find).unwrap(),
        mat = serde_json::to_string(mat).unwrap(),
        rep = serde_json::to_string(replace).unwrap(),
    );
    fs::write(&p, body)?;
    Ok(p)
}
