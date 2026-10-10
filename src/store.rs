//! Plugin store client.
//!
//! Trust chain: the exe pins an Ed25519 public key -> signed `index.json` (monotonic version, expiry)
//! -> per-file SHA-256 in the index -> files. Install is staged, verified, journaled and swapped in atomically.
use crate::{paths, plugins};
use anyhow::{anyhow, bail, Context, Result};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

const PUBKEY_HEX: &str = include_str!("../keys/store.pub");
const MAX_FILE: u64 = 8 * 1024 * 1024;
const MAX_FILES: usize = 64;
const MAX_INDEX: u64 = 4 * 1024 * 1024;
/// Base name for the catalog compiled into this exe.
const BUILT_IN: &str = "built-in";

include!(concat!(env!("OUT_DIR"), "/embedded_store.rs"));

/// Where the catalog lives: config override, env var, then a `store/` folder next to the exe or in one of its parent
/// folders, and otherwise the catalog built into the exe.
pub fn base(configured: &str) -> String {
    if !configured.is_empty() { return configured.to_string(); }
    if let Ok(v) = std::env::var("MECORD_STORE") { return v; }
    if let Ok(exe) = std::env::current_exe() {
        for up in [exe.parent(), exe.parent().and_then(|p| p.parent()), exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent())].into_iter().flatten() {
            let c = up.join("store");
            if c.join("index.json").exists() { return c.to_string_lossy().into_owned(); }
        }
    }
    BUILT_IN.into()
}

fn fetch(base: &str, rel: &str, limit: u64) -> Result<Vec<u8>> {
    if base.starts_with("http://") || base.starts_with("https://") {
        let url = format!("{}/{}", base.trim_end_matches('/'), rel);
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).redirects(3).build();
        let resp = agent.get(&url).call().map_err(|e| anyhow!("GET {url}: {e}"))?;
        let mut buf = vec![];
        resp.into_reader().take(limit + 1).read_to_end(&mut buf)?;
        if buf.len() as u64 > limit { bail!("{rel}: larger than allowed ({limit} bytes)") }
        Ok(buf)
    } else if base == BUILT_IN {
        let (_, data) = BUILT_IN_FILES.iter().find(|(name, _)| *name == rel)
            .ok_or_else(|| anyhow!("{rel} is not in the catalog built into this exe (no store folder was found next to mecord.exe)"))?;
        if data.len() as u64 > limit { bail!("{rel}: larger than allowed") }
        Ok(data.to_vec())
    } else {
        let p = Path::new(base.trim_start_matches("file:///")).join(rel);
        let md = fs::metadata(&p).with_context(|| format!("reading {}", p.display()))?;
        if md.len() > limit { bail!("{rel}: larger than allowed") }
        Ok(fs::read(p)?)
    }
}

fn verify_index(bytes: &[u8], sig_hex: &[u8]) -> Result<()> {
    let key_bytes: [u8; 32] = hex::decode(PUBKEY_HEX.trim())?.try_into().map_err(|_| anyhow!("bad pinned key"))?;
    let key = VerifyingKey::from_bytes(&key_bytes)?;
    let sig_bytes: [u8; 64] = hex::decode(String::from_utf8_lossy(sig_hex).trim())?.try_into().map_err(|_| anyhow!("bad signature length"))?;
    key.verify(bytes, &Signature::from_bytes(&sig_bytes)).map_err(|_| anyhow!("index signature is INVALID; refusing to use this catalog"))
}

pub struct Index { pub json: Value }

/// Fetch and verify the catalog. `min_version` blocks rollback to an older index.
pub fn load_index(base: &str, min_version: u64) -> Result<Index> {
    let fresh = (|| -> Result<(Vec<u8>, Vec<u8>)> {
        Ok((fetch(base, "index.json", MAX_INDEX)?, fetch(base, "index.json.sig", 1024)?))
    })();
    let (bytes, sig) = match fresh {
        Ok(x) => x,
        Err(e) => {
            // Offline: fall back to the last verified copy (still subject to the expiry check below).
            let b = fs::read(paths::cache().join("index.json")).map_err(|_| e)?;
            let s = fs::read(paths::cache().join("index.json.sig"))?;
            (b, s)
        }
    };
    verify_index(&bytes, &sig)?;
    let json: Value = serde_json::from_slice(&bytes)?;
    if json["schema"] != 1 { bail!("unsupported index schema") }
    let exp = json["expires"].as_u64().unwrap_or(0);
    if exp < paths::now() { bail!("catalog index has expired; it must be re-signed by the publisher") }
    if json["version"].as_u64().unwrap_or(0) < min_version { bail!("catalog index is older than one already seen (rollback refused)") }
    let _ = paths::write_atomic(&paths::cache().join("index.json"), &bytes);
    let _ = paths::write_atomic(&paths::cache().join("index.json.sig"), &sig);
    Ok(Index { json })
}

fn safe_rel(p: &str) -> bool {
    !p.is_empty() && p.len() < 128 && !p.starts_with('/') && !p.contains('\\') && !p.contains(':')
        && p.split('/').all(|c| !c.is_empty() && c != "." && c != ".." && c.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_. ".contains(&b)))
}

pub fn sha256_hex(b: &[u8]) -> String { hex::encode(Sha256::digest(b)) }

/// Summary rows for the UI.
pub fn public_list(idx: &Index) -> Value {
    let rows: Vec<Value> = idx.json["plugins"].as_array().cloned().unwrap_or_default().into_iter().map(|p| {
        let files = p["files"].as_array().cloned().unwrap_or_default();
        json!({
            "id": p["id"], "name": p["name"], "version": p["version"], "description": p["description"], "author": p["author"],
            "tags": p["tags"], "category": p["category"], "capabilities": p["capabilities"], "native": p["native"], "files": files.len(), "sha256": p["sha256"],
        })
    }).collect();
    let themes: Vec<Value> = idx.json["themes"].as_array().cloned().unwrap_or_default().into_iter().map(|t| {
        json!({ "id": t["id"], "name": t["name"], "version": t["version"], "description": t["description"], "author": t["author"], "tags": t["tags"] })
    }).collect();
    json!({ "plugins": rows, "themes": themes, "verified": true })
}

/// Install (or update) one signed theme: a single CSS file written to the themes folder, where the local-theme watcher picks it up.
/// The page gets a `theme.added` entry, disabled, and switches it on itself.
pub fn install_theme(idx: &Index, id: &str, base_url: &str) -> Result<Value> {
    if !paths::valid_id(id) { bail!("invalid theme id") }
    let entry = idx.json["themes"].as_array().and_then(|a| a.iter().find(|t| t["id"] == id)).ok_or_else(|| anyhow!("{id} is not in the catalog"))?;
    let version = entry["version"].as_str().ok_or_else(|| anyhow!("missing version"))?;
    if !paths::valid_id(version) { bail!("invalid version string") }
    let file = entry["files"].as_array().and_then(|a| a.first()).ok_or_else(|| anyhow!("theme has no file"))?;
    let rel = file["path"].as_str().ok_or_else(|| anyhow!("file without path"))?;
    if !safe_rel(rel) { bail!("unsafe path in catalog: {rel}") }
    let want = file["sha256"].as_str().unwrap_or_default().to_lowercase();
    let size = file["size"].as_u64().unwrap_or(MAX_FILE).min(MAX_FILE);
    let data = fetch(base_url, &format!("themes/{id}/{version}/{rel}"), size)?;
    let got = sha256_hex(&data);
    if got != want { bail!("{rel}: SHA-256 mismatch (expected {want}, got {got}); nothing was installed") }
    let css = String::from_utf8(data).map_err(|_| anyhow!("theme is not UTF-8 text"))?;
    let file_name = format!("{id}.theme.css");
    paths::write_atomic(&paths::themes().join(&file_name), css.as_bytes())?;
    Ok(json!({
        "id": id, "name": entry["name"], "version": version, "description": entry["description"], "author": entry["author"],
        "origin": "store", "file": file_name, "css": css, "enabled": false,
    }))
}

/// Remove a store theme's file. The page drops its config entry itself.
pub fn uninstall_theme(id: &str) -> Result<()> {
    if !paths::valid_id(id) { bail!("invalid theme id") }
    let p = paths::themes().join(format!("{id}.theme.css"));
    if p.exists() { fs::remove_file(p)?; }
    Ok(())
}

/// Install (or update) one plugin atomically. Returns the page entry.
pub fn install(idx: &Index, id: &str, base_url: &str) -> Result<Value> {
    if !paths::valid_id(id) { bail!("invalid plugin id") }
    let entry = idx.json["plugins"].as_array().and_then(|a| a.iter().find(|p| p["id"] == id)).ok_or_else(|| anyhow!("{id} is not in the catalog"))?;
    let version = entry["version"].as_str().ok_or_else(|| anyhow!("missing version"))?;
    if !paths::valid_id(version) { bail!("invalid version string") }
    let files = entry["files"].as_array().ok_or_else(|| anyhow!("no files"))?;
    if files.is_empty() || files.len() > MAX_FILES { bail!("bad file count") }

    let staging = paths::plugins().join(".staging").join(format!("{id}-{version}-{}", paths::now()));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging)?;
    let result = (|| -> Result<Value> {
        // 1. download + verify every file against the signed index
        for f in files {
            let rel = f["path"].as_str().ok_or_else(|| anyhow!("file without path"))?;
            if !safe_rel(rel) { bail!("unsafe path in catalog: {rel}") }
            let want = f["sha256"].as_str().unwrap_or_default().to_lowercase();
            let size = f["size"].as_u64().unwrap_or(MAX_FILE).min(MAX_FILE);
            let data = fetch(base_url, &format!("plugins/{id}/{version}/{rel}"), size)?;
            let got = sha256_hex(&data);
            if got != want { bail!("{rel}: SHA-256 mismatch (expected {want}, got {got}); nothing was installed") }
            let dest = staging.join(rel);
            if let Some(d) = dest.parent() { fs::create_dir_all(d)?; }
            fs::write(&dest, &data)?;
        }
        if !staging.join("index.js").exists() { bail!("plugin has no index.js") }
        // 2. host-authored metadata (page-visible `native`/`capabilities` come from the signed index, not from plugin files)
        let meta = json!({
            "id": id, "name": entry["name"], "version": version, "description": entry["description"], "author": entry["author"],
            "tags": entry["tags"], "category": entry["category"], "capabilities": entry["capabilities"], "native": entry["native"],
        });
        fs::write(staging.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        // 3. journal, then swap into place
        let final_dir = plugins::store_dir(id, version);
        let jpath = paths::journal().join(format!("{id}.json"));
        paths::write_json(&jpath, &json!({ "op": "install", "id": id, "version": version, "staging": staging, "final": final_dir }))?;
        if final_dir.exists() { fs::remove_dir_all(&final_dir)?; }
        fs::create_dir_all(final_dir.parent().unwrap())?;
        fs::rename(&staging, &final_dir)?;
        let mut inst = plugins::installed_map();
        let previous = inst.insert(id.to_string(), json!(version));
        plugins::save_installed(&inst)?;
        let _ = fs::remove_file(&jpath);
        // 4. keep exactly one previous version for rollback
        prune(id, version, previous.as_ref().and_then(|v| v.as_str()));
        let mut e = meta;
        e["origin"] = json!("store");
        e["source"] = json!(fs::read_to_string(final_dir.join("index.js"))?);
        Ok(e)
    })();
    if result.is_err() { let _ = fs::remove_dir_all(&staging); }
    result
}

fn prune(id: &str, current: &str, previous: Option<&str>) {
    let Ok(rd) = fs::read_dir(paths::plugins().join(id)) else { return };
    for e in rd.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if n != current && Some(n.as_str()) != previous { let _ = fs::remove_dir_all(e.path()); }
    }
}

pub fn uninstall(id: &str) -> Result<()> {
    if !paths::valid_id(id) { bail!("invalid plugin id") }
    let mut inst = plugins::installed_map();
    if inst.remove(id).is_none() { bail!("{id} is not installed from the store") }
    plugins::save_installed(&inst)?;
    let _ = fs::remove_dir_all(paths::plugins().join(id));
    Ok(())
}

/// Finish or discard interrupted installs. Safe to run on every startup.
pub fn recover() {
    let Ok(rd) = fs::read_dir(paths::journal()) else { return };
    for e in rd.flatten() {
        let Some(j) = paths::read_json(&e.path()) else { let _ = fs::remove_file(e.path()); continue };
        let (id, ver) = (j["id"].as_str().unwrap_or(""), j["version"].as_str().unwrap_or(""));
        let fin = PathBuf::from(j["final"].as_str().unwrap_or(""));
        let mut inst = plugins::installed_map();
        if fin.join("index.js").exists() && fin.join("meta.json").exists() {
            // Swap happened; make sure the pointer matches.
            if inst.get(id).and_then(|v| v.as_str()) != Some(ver) { inst.insert(id.to_string(), json!(ver)); let _ = plugins::save_installed(&inst); }
            paths::log("info", &format!("recovered install of {id}@{ver}"));
        } else {
            if let Some(s) = j["staging"].as_str() { let _ = fs::remove_dir_all(s); }
            paths::log("warn", &format!("discarded interrupted install of {id}@{ver}"));
        }
        let _ = fs::remove_file(e.path());
    }
    let _ = fs::remove_dir_all(paths::plugins().join(".staging"));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn built_in(name: &str) -> Option<&'static [u8]> {
        BUILT_IN_FILES.iter().find(|(n, _)| *n == name).map(|(_, d)| *d)
    }

    /// The exe must carry a catalog that the pinned key signed, and every file that index lists.
    #[test]
    fn built_in_catalog_verifies_and_matches_its_index() {
        let idx = built_in("index.json").expect("store/index.json must be built (npm run build) before cargo test");
        verify_index(idx, built_in("index.json.sig").expect("store/index.json.sig must be built")).expect("built-in catalog must verify");
        let json: Value = serde_json::from_slice(idx).unwrap();
        let mut checked = 0;
        for (kind, items) in [("plugins", &json["plugins"]), ("themes", &json["themes"])] {
            for item in items.as_array().unwrap() {
                let (id, version) = (item["id"].as_str().unwrap(), item["version"].as_str().unwrap());
                for f in item["files"].as_array().unwrap() {
                    let rel = f["path"].as_str().unwrap();
                    let data = fetch(BUILT_IN, &format!("{kind}/{id}/{version}/{rel}"), MAX_FILE).unwrap();
                    assert_eq!(sha256_hex(&data), f["sha256"].as_str().unwrap().to_lowercase(), "{id}/{rel}");
                    checked += 1;
                }
            }
        }
        assert!(checked > 0);
    }

    /// The test binary runs from target\debug, where no store folder is found, so it must use the built-in catalog.
    #[test]
    fn without_a_store_folder_the_built_in_catalog_is_used() {
        if std::env::var_os("MECORD_STORE").is_none() { assert_eq!(base(""), BUILT_IN); }
    }
}
