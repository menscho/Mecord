//! Export/import of settings, enabled plugins, themes and Quick CSS as one JSON file.
use crate::paths;
use anyhow::{bail, Result};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

fn looks_secret(k: &str) -> bool {
    let k = k.to_lowercase();
    ["key", "token", "secret", "password", "passwd"].iter().any(|w| k.contains(w))
}

pub fn export(cfg: &Value, secrets: &Value, installed: &Map<String, Value>) -> Result<PathBuf> {
    let mut plugins = vec![];
    for (id, p) in cfg["plugins"].as_object().cloned().unwrap_or_default() {
        let declared: HashSet<String> = secrets[&id].as_array().map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default();
        let mut settings = Map::new();
        for (k, v) in p["settings"].as_object().cloned().unwrap_or_default() {
            if !declared.contains(&k) && !looks_secret(&k) { settings.insert(k, v); }
        }
        let origin = if installed.contains_key(&id) { "store" } else { "user" };
        plugins.push(json!({ "id": id, "origin": origin, "version": installed.get(&id), "enabled": p["enabled"], "settings": settings }));
    }
    let mut themes = vec![];
    for t in cfg["themes"].as_array().cloned().unwrap_or_default() {
        let mut o = json!({ "id": t["id"], "name": t["name"], "enabled": t["enabled"], "url": t["url"] });
        if t["url"].is_null() {
            // Local themes are embedded so a restore on a fresh machine brings them back.
            if let Some(f) = t["file"].as_str() { o["css"] = json!(fs::read_to_string(paths::themes().join(f)).unwrap_or_default()); }
        }
        themes.push(o);
    }
    let doc = json!({
        "schema": 1, "created": paths::now(), "mecord": env!("CARGO_PKG_VERSION"),
        "settings": {
            "ui": cfg["ui"], "wallpaper": cfg["wallpaper"], "keybinds": cfg["keybinds"], "look": cfg["look"],
            "favorites": cfg["favorites"], "profiles": cfg["profiles"],
        },
        "plugins": plugins, "themes": themes, "quickCss": cfg["quickCss"],
    });
    let docs = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(paths::backups).join("Documents");
    let dir = if docs.is_dir() { docs } else { paths::backups() };
    let path = dir.join(format!("Mecord-backup-{}.json", paths::now()));
    fs::write(&path, serde_json::to_vec_pretty(&doc)?)?;
    Ok(path)
}

pub struct Imported { pub cfg: Value, pub to_install: Vec<String>, pub summary: String }

/// Validate + apply. Never executes anything from the file; plugins are only *named*, then installed via the verified store path.
pub fn import(current: &Value, json_text: &str, mode: &str, overwrite_css: bool) -> Result<Imported> {
    if json_text.len() > 8 * 1024 * 1024 { bail!("backup file is too large") }
    let doc: Value = serde_json::from_str(json_text).map_err(|e| anyhow::anyhow!("not valid JSON: {e}"))?;
    if doc["schema"] != 1 { bail!("unsupported backup schema {}", doc["schema"]) }
    if !matches!(mode, "merge" | "replace") { bail!("unknown mode") }
    // Snapshot first so either mode can be undone.
    let snap = paths::backups().join(format!("pre-import-{}.json", paths::now()));
    fs::write(&snap, serde_json::to_vec_pretty(current)?)?;

    let mut cfg = current.clone();
    let replace = mode == "replace";
    if replace {
        cfg["plugins"] = json!({}); cfg["themes"] = json!([]); cfg["quickCss"] = json!("");
        cfg["keybinds"] = json!({}); cfg["favorites"] = json!([]); cfg["profiles"] = json!([]);
    }
    // settings: incoming wins per key
    for sect in ["ui", "wallpaper", "keybinds", "look"] {
        if let Some(o) = doc["settings"][sect].as_object() { for (k, v) in o { cfg[sect][k] = v.clone(); } }
    }
    // Profiles and favourites merge by id (or, in replace mode, are taken as they are).
    if let Some(ps) = doc["settings"]["profiles"].as_array() {
        let mut list = if replace { vec![] } else { cfg["profiles"].as_array().cloned().unwrap_or_default() };
        for p in ps.iter().filter(|p| p["id"].as_str().is_some_and(paths::valid_id)) {
            list.retain(|x| x["id"] != p["id"]);
            list.push(p.clone());
        }
        cfg["profiles"] = json!(list);
    }
    if let Some(fav) = doc["settings"]["favorites"].as_array() {
        let mut list = if replace { vec![] } else { cfg["favorites"].as_array().cloned().unwrap_or_default() };
        for id in fav.iter().filter_map(|f| f.as_str()).filter(|i| paths::valid_id(i)) {
            if !list.iter().any(|x| x == id) { list.push(json!(id)); }
        }
        cfg["favorites"] = json!(list);
    }
    let mut to_install = vec![];
    let (mut np, mut nt) = (0, 0);
    for p in doc["plugins"].as_array().cloned().unwrap_or_default() {
        let Some(id) = p["id"].as_str().filter(|i| paths::valid_id(i)) else { continue };
        let slot = &mut cfg["plugins"][id];
        if slot.is_null() { *slot = json!({ "enabled": false, "settings": {} }); }
        slot["enabled"] = p["enabled"].clone();
        if let Some(o) = p["settings"].as_object() { for (k, v) in o { if !looks_secret(k) { slot["settings"][k] = v.clone(); } } }
        if p["origin"] == "store" { to_install.push(id.to_string()); }
        np += 1;
    }
    let mut themes = cfg["themes"].as_array().cloned().unwrap_or_default();
    for t in doc["themes"].as_array().cloned().unwrap_or_default() {
        let Some(id) = t["id"].as_str().filter(|i| paths::valid_id(i)) else { continue };
        let mut entry = json!({ "id": id, "name": t["name"], "enabled": t["enabled"] });
        if let Some(u) = t["url"].as_str() { entry["url"] = json!(u); }
        else if let Some(css) = t["css"].as_str() {
            let f = paths::themes().join(format!("{id}.theme.css"));
            if !f.exists() || replace { fs::write(&f, css)?; }
            entry["file"] = json!(format!("{id}.theme.css"));
        } else { continue }
        match themes.iter_mut().find(|x| x["id"] == id) { Some(x) => *x = entry, None => themes.push(entry) }
        nt += 1;
    }
    cfg["themes"] = json!(themes);
    if (replace || overwrite_css) && doc["quickCss"].is_string() { cfg["quickCss"] = doc["quickCss"].clone(); }
    let summary = format!("Imported {np} plugin setting(s), {nt} theme(s) ({mode}). Snapshot: {}.", snap.file_name().unwrap().to_string_lossy());
    Ok(Imported { cfg, to_install, summary })
}
