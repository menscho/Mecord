//! Native-code plugins: out-of-process helpers, spawned only after hash-bound user consent.
//!
//! Protocol: newline-delimited JSON. Request `{"id":n,"method":"..","args":..}`, response `{"id":n,"result":..}` or `{"id":n,"error":".."}`.
use crate::{paths, plugins, store, ui};
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Helper { child: Child, stdin: ChildStdin, rx: Receiver<String>, next: u64 }
static HELPERS: OnceLock<Mutex<HashMap<String, Helper>>> = OnceLock::new();
fn helpers() -> &'static Mutex<HashMap<String, Helper>> { HELPERS.get_or_init(|| Mutex::new(HashMap::new())) }

fn meta_of(id: &str) -> Result<Value> {
    let inst = plugins::installed_map();
    let ver = inst.get(id).and_then(|v| v.as_str()).ok_or_else(|| anyhow!("{id} is not an installed store plugin"))?;
    paths::read_json(&plugins::store_dir(id, ver).join("meta.json")).ok_or_else(|| anyhow!("missing plugin metadata"))
}

/// Ask the user (in a native dialog the page cannot forge) to trust this exact helper. Returns the consented hash.
pub fn request_consent(id: &str) -> Result<String> {
    let meta = meta_of(id)?;
    let nat = &meta["native"];
    let (kind, sha) = (nat["kind"].as_str().unwrap_or("?"), nat["sha256"].as_str().unwrap_or(""));
    if sha.is_empty() { bail!("plugin has no native helper") }
    let text = format!(
        "\"{}\" wants to run a native helper program on your computer.\n\nIt runs outside Discord's sandbox with your user account's permissions.\n\nType: {}\nCapabilities: {}\nSHA-256:\n{}\n\nAllow this exact helper?",
        meta["name"].as_str().unwrap_or(id), kind,
        meta["capabilities"].as_array().map(|a| a.iter().filter_map(|c| c.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(), sha);
    if !ui::confirm("Mecord: native code plugin", &text) { bail!("consent declined") }
    Ok(sha.to_string())
}

/// Spawn from a private, hash-verified copy so the file can't be swapped between check and launch.
fn spawn(id: &str, consent: &Value) -> Result<Helper> {
    let meta = meta_of(id)?;
    let nat = &meta["native"];
    let (kind, file, sha) = (nat["kind"].as_str().unwrap_or(""), nat["file"].as_str().unwrap_or(""), nat["sha256"].as_str().unwrap_or(""));
    if consent[id].as_str() != Some(sha) || sha.is_empty() { bail!("native helper not authorized (no consent for this exact hash)") }
    let ver = meta["version"].as_str().unwrap_or("");
    let bytes = std::fs::read(plugins::store_dir(id, ver).join(file)).context("reading helper")?;
    if store::sha256_hex(&bytes) != sha { bail!("helper file does not match its signed hash; refusing to run") }
    let ext = if kind == "ps1" { "ps1" } else { "exe" };
    let dir = paths::cache().join("native");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{sha}.{ext}"));
    // Always (re)write if the cached copy differs, comparing full contents so a tampered cache copy can't be reused.
    if std::fs::read(&path).ok().as_deref() != Some(&bytes[..]) { paths::write_atomic(&path, &bytes)?; }
    let mut cmd = if kind == "ps1" {
        let mut c = Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]).arg(&path);
        c
    } else if kind == "exe" { Command::new(&path) } else { bail!("unknown helper kind {kind}") };
    let mut child = cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn().context("spawning helper")?;
    let stdin = child.stdin.take().unwrap();
    let out = child.stdout.take().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || { for l in BufReader::new(out).lines().map_while(|l| l.ok()) { if tx.send(l).is_err() { break } } });
    Ok(Helper { child, stdin, rx, next: 0 })
}

pub fn call(id: &str, method: &str, args: &Value, consent: &Value) -> Result<Value> {
    let mut map = helpers().lock().unwrap();
    if let Some(h) = map.get_mut(id) { if h.child.try_wait()?.is_some() { map.remove(id); } }
    if !map.contains_key(id) { map.insert(id.to_string(), spawn(id, consent)?); }
    let h = map.get_mut(id).unwrap();
    h.next += 1;
    let want = h.next;
    writeln!(h.stdin, "{}", json!({ "id": want, "method": method, "args": args }))?;
    h.stdin.flush()?;
    loop {
        let line = h.rx.recv_timeout(Duration::from_secs(30)).map_err(|_| anyhow!("native helper timed out"))?;
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if v["id"] != want { continue }
        if let Some(e) = v["error"].as_str() { bail!("{e}") }
        return Ok(v["result"].clone());
    }
}

pub fn stop(id: &str) { if let Some(mut h) = helpers().lock().unwrap().remove(id) { let _ = h.child.kill(); } }
pub fn stop_all() { for (_, mut h) in helpers().lock().unwrap().drain() { let _ = h.child.kill(); } }
