//! The supervisor loop: attaches to Discord's page(s), injects the core, serves the page's RPC, hot-reloads plugins/themes,
//! and recovers to an uninjected page if the core fails to come up.
use crate::cdp::Cdp;
use crate::config::Config;
use crate::{backup, fileserve, native, paths, plugins, store, themes, ui};
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant, SystemTime};

const CORE_JS: &str = include_str!("../core/dist/core.js");
const READY_TIMEOUT: Duration = Duration::from_secs(25);

pub struct Opts { pub safe: bool, pub diagnose: bool, pub discord_version: String }

struct Sess { script_id: String, injected: Instant, booted: Option<Instant>, ready: bool, recovered: bool }

#[derive(Default)]
struct Reply {
    sid: String,
    id: u64,
    res: Option<Result<Value, String>>,
    events: Vec<(String, Value)>,
    min_version: Option<u64>,
    consent: Option<(String, String)>,
    set_config: Option<Value>,
    etags: Vec<(String, String)>,
}

pub struct Host {
    cdp: Cdp,
    cfg: Config,
    opts: Opts,
    sess: HashMap<String, Sess>,
    /// targetId -> sessionId, so a page is injected exactly once.
    attached: HashMap<String, String>,
    tx: Sender<Reply>,
    rx: Receiver<Reply>,
    user: HashMap<String, (SystemTime, u64)>,
    tw: themes::Watch,
    /// Set when the page asks for a Discord restart; `run` returns so main can relaunch Discord.
    restart: bool,
}

pub fn read_active_port(path: &std::path::Path, wait: Duration) -> Option<(u16, String)> {
    let deadline = Instant::now() + wait;
    loop {
        if let Ok(s) = std::fs::read_to_string(path) {
            let mut l = s.lines();
            if let (Some(p), Some(b)) = (l.next(), l.next()) {
                if let Ok(p) = p.trim().parse::<u16>() { return Some((p, b.trim().to_string())); }
            }
        }
        if Instant::now() > deadline { return None }
        std::thread::sleep(Duration::from_millis(200));
    }
}

impl Host {
    pub fn new(cdp: Cdp, opts: Opts) -> Self {
        let (tx, rx) = channel();
        let mut tw = themes::Watch::default();
        let _ = themes::local_changes(&mut tw); // seed: files that exist now are not "changes"
        Self { cdp, cfg: Config::load(), opts, sess: HashMap::new(), attached: HashMap::new(), tx, rx, user: HashMap::new(), tw, restart: false }
    }

    fn safe_now(&self) -> bool { self.opts.safe || self.cfg.host_u64("bootFailures") >= 3 }
    fn store_base(&self) -> String { store::base(self.cfg.v["host"]["storeUrl"].as_str().unwrap_or("")) }

    /// Runs until the CDP connection drops (Discord exited, an error) or the page asks for a restart, which returns `Ok(true)`.
    pub fn run(&mut self) -> Result<bool> {
        let mut last_attach = Instant::now() - Duration::from_secs(10);
        let mut last_watch = Instant::now();
        let mut last_refresh = Instant::now();
        // Start at once, then every 30 minutes.
        let mut last_store = Instant::now() - Duration::from_secs(60 * 60);
        self.cdp.call(None, "Target.setDiscoverTargets", json!({ "discover": true }))?;
        loop {
            if self.restart { return Ok(true) }
            self.drain_replies();
            if let Some(ev) = self.cdp.read()? { self.on_event(ev); }
            if last_attach.elapsed() > Duration::from_millis(800) { last_attach = Instant::now(); self.attach_new()?; }
            if last_watch.elapsed() > Duration::from_millis(400) { last_watch = Instant::now(); self.watch(); }
            if last_refresh.elapsed() > Duration::from_secs(60) { last_refresh = Instant::now(); self.refresh_themes(); }
            if last_store.elapsed() > Duration::from_secs(30 * 60) && !self.safe_now() { last_store = Instant::now(); self.check_store(); }
            self.watchdog();
        }
    }

    // ---------- attach / inject ----------
    fn attach_new(&mut self) -> Result<()> {
        let r = self.cdp.call(None, "Target.getTargets", json!({}))?;
        for t in r["targetInfos"].as_array().cloned().unwrap_or_default() {
            let url = t["url"].as_str().unwrap_or("");
            if t["type"] != "page" || !(url.contains("discord.com/")) { continue }
            let tid = t["targetId"].as_str().unwrap_or("").to_string();
            if self.attached.contains_key(&tid) { continue }
            match self.inject(&tid) {
                Ok(()) => {}
                Err(e) => { paths::log("error", &format!("inject {tid}: {e:#}")); self.attached.insert(tid, String::new()); }
            }
        }
        Ok(())
    }

    fn inject(&mut self, tid: &str) -> Result<()> {
        let sid = self.cdp.call(None, "Target.attachToTarget", json!({ "targetId": tid, "flatten": true }))?["sessionId"].as_str().unwrap_or("").to_string();
        let s = Some(sid.as_str());
        self.cdp.call(s, "Runtime.enable", json!({}))?;
        self.cdp.call(s, "Page.enable", json!({}))?;
        self.cdp.call(s, "Page.setBypassCSP", json!({ "enabled": true }))?;
        self.cdp.call(s, "Runtime.addBinding", json!({ "name": "__mecordBinding" }))?;
        let safe = self.safe_now();
        // Debug-only hook so recovery paths can be tested with a deliberately broken core.
        #[cfg(debug_assertions)]
        let core = std::env::var("MECORD_CORE_OVERRIDE").ok().and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_else(|| CORE_JS.to_string());
        #[cfg(not(debug_assertions))]
        let core = CORE_JS.to_string();
        let src = format!("window.__mecordSafe={safe};\n{core}");
        let script_id = self.cdp.call(s, "Page.addScriptToEvaluateOnNewDocument", json!({ "source": src }))?["identifier"].as_str().unwrap_or("").to_string();
        // The page may already have run its scripts; reload so ours runs first.
        self.cdp.call(s, "Page.reload", json!({}))?;
        paths::log("info", &format!("injected into {tid} (safe={safe})"));
        self.attached.insert(tid.to_string(), sid.clone());
        self.sess.insert(sid, Sess { script_id, injected: Instant::now(), booted: None, ready: false, recovered: false });
        Ok(())
    }

    fn watchdog(&mut self) {
        let mut failed = vec![];
        for (sid, s) in &self.sess {
            // A core that dies before even calling init (syntax error, crash) must be caught too: count from injection.
            let since = s.booted.unwrap_or(s.injected);
            if !s.ready && !s.recovered && since.elapsed() > READY_TIMEOUT { failed.push(sid.clone()); }
        }
        for sid in failed {
            let fails = self.cfg.host_u64("bootFailures") + 1;
            self.cfg.set_host("bootFailures", json!(fails));
            paths::log("error", &format!("core never became ready (failure #{fails}); reverting page to vanilla"));
            let id = self.sess.get(&sid).map(|s| s.script_id.clone()).unwrap_or_default();
            let _ = self.cdp.send(Some(&sid), "Page.removeScriptToEvaluateOnNewDocument", json!({ "identifier": id }));
            let _ = self.cdp.send(Some(&sid), "Page.setBypassCSP", json!({ "enabled": false }));
            let _ = self.cdp.send(Some(&sid), "Page.reload", json!({}));
            if let Some(s) = self.sess.get_mut(&sid) { s.recovered = true; }
        }
    }

    // ---------- events ----------
    fn on_event(&mut self, ev: Value) {
        match ev["method"].as_str().unwrap_or("") {
            "Runtime.bindingCalled" if ev["params"]["name"] == "__mecordBinding" => {
                let sid = ev["sessionId"].as_str().unwrap_or("").to_string();
                let Ok(msg) = serde_json::from_str::<Value>(ev["params"]["payload"].as_str().unwrap_or("{}")) else { return };
                let id = msg["id"].as_u64().unwrap_or(0);
                let op = msg["op"].as_str().unwrap_or("").to_string();
                self.handle_op(&sid, id, &op, msg["args"].clone());
            }
            "Target.detachedFromTarget" => { if let Some(s) = ev["params"]["sessionId"].as_str() { self.sess.remove(s); self.attached.retain(|_, v| v != s); } }
            "Target.targetDestroyed" => { if let Some(t) = ev["params"]["targetId"].as_str() { if let Some(sid) = self.attached.remove(t) { self.sess.remove(&sid); } } }
            _ => {}
        }
    }

    fn respond(&mut self, sid: &str, id: u64, res: Result<Value, String>) {
        if id == 0 { return }
        let m = match res { Ok(v) => json!({ "id": id, "ok": true, "result": v }), Err(e) => json!({ "id": id, "ok": false, "error": e }) };
        self.eval(sid, &m);
    }
    fn eval(&mut self, sid: &str, v: &Value) {
        let _ = self.cdp.send(Some(sid), "Runtime.evaluate", json!({ "expression": format!("window.__mecord_rx&&window.__mecord_rx({v})") }));
    }
    fn broadcast(&mut self, event: &str, data: &Value) {
        let ids: Vec<String> = self.sess.iter().filter(|(_, s)| s.booted.is_some() && !s.recovered).map(|(k, _)| k.clone()).collect();
        for sid in ids { self.eval(&sid, &json!({ "event": event, "data": data })); }
    }

    fn drain_replies(&mut self) {
        while let Ok(r) = self.rx.try_recv() {
            if let Some(v) = r.min_version { if v > self.cfg.host_u64("storeMinVersion") { self.cfg.set_host("storeMinVersion", json!(v)); } }
            if let Some((id, sha)) = &r.consent { self.cfg.v["consent"][id] = json!(sha); self.cfg.save(); }
            if let Some(c) = r.set_config { self.cfg.v = c; self.cfg.save(); }
            for (id, tag) in r.etags { self.tw.etags.insert(id, tag); }
            for (e, d) in &r.events { self.broadcast(e, d); }
            if let Some(res) = r.res { self.respond(&r.sid, r.id, res); }
        }
    }

    // ---------- watching ----------
    fn watch(&mut self) {
        if self.safe_now() { return }
        let current = plugins::user_sources();
        let mut seen = vec![];
        let mut events = vec![];
        for (id, entry, stamp) in current {
            seen.push(id.clone());
            if self.user.get(&id) == Some(&stamp) { continue }
            let known = self.user.insert(id.clone(), stamp).is_some();
            if self.installed_ids().contains(&id) { continue }
            let (ev, msg) = match plugins::user_entry(&id, &entry) {
                Ok(e) => (e, None),
                Err(err) => { paths::log("warn", &format!("compile {id}: {err}")); (plugins::broken_entry(&id, &err), Some(err)) }
            };
            events.push((if known { "plugin.update" } else { "plugin.discovered" }, ev, msg));
        }
        let gone: Vec<String> = self.user.keys().filter(|k| !seen.contains(k)).cloned().collect();
        for g in gone { self.user.remove(&g); self.broadcast("plugin.removed", &json!({ "id": g })); }
        for (name, e, err) in events {
            self.broadcast(name, &e);
            if let Some(err) = err { self.broadcast("toast", &json!({ "message": format!("{}: compile error", e["id"].as_str().unwrap_or("?")), "type": "error", "detail": err })); }
        }
        for t in themes::local_changes(&mut self.tw) { self.broadcast("theme.update", &t); }
    }
    fn installed_ids(&self) -> Vec<String> { plugins::installed_map().keys().cloned().collect() }

    /// Look at the catalog in the background, so update dots appear without opening the store. Pages refresh on `store.updated`.
    fn check_store(&self) {
        let (base, min) = (self.store_base(), self.cfg.host_u64("storeMinVersion"));
        let have = plugins::installed_map();
        let tx = self.tx.clone();
        std::thread::spawn(move || {
            let Ok(idx) = store::load_index(&base, min) else { return };
            let updates = idx.json["plugins"].as_array().map_or(0, |a| a.iter().filter(|p| {
                let Some(id) = p["id"].as_str() else { return false };
                matches!(have.get(id).and_then(|v| v.as_str()), Some(cur) if Some(cur) != p["version"].as_str())
            }).count());
            let mut r = Reply::default();
            r.min_version = idx.json["version"].as_u64();
            r.events.push(("store.updated".into(), json!({ "updates": updates })));
            let _ = tx.send(r);
        });
    }

    fn refresh_themes(&mut self) {
        let (tx, th, et) = (self.tx.clone(), self.cfg.v["themes"].clone(), self.tw.etags.clone());
        std::thread::spawn(move || {
            let out = themes::refresh_urls(&th, &et);
            let mut r = Reply::default();
            for (e, tag) in out {
                if let Some(t) = tag { r.etags.push((e["id"].as_str().unwrap_or("").to_string(), t)); }
                r.events.push(("theme.update".into(), e));
            }
            if !r.events.is_empty() { let _ = tx.send(r); }
        });
    }

    // ---------- RPC ----------
    fn handle_op(&mut self, sid: &str, id: u64, op: &str, a: Value) {
        let tx = self.tx.clone();
        let sidc = sid.to_string();
        let spawn = |f: Box<dyn FnOnce() -> Reply + Send>| {
            std::thread::spawn(move || { let mut r = f(); r.sid = sidc; r.id = id; let _ = tx.send(r); });
        };
        let ok = |v: Value| Reply { res: Some(Ok(v)), ..Default::default() };
        let err = |e: String| Reply { res: Some(Err(e)), ..Default::default() };
        match op {
            "init" => {
                let r = self.init(sid);
                self.respond(sid, id, r);
            }
            "ready" => {
                if let Some(s) = self.sess.get_mut(sid) { s.ready = true; }
                if self.cfg.host_u64("bootFailures") != 0 && !self.safe_now() { self.cfg.set_host("bootFailures", json!(0)); }
                paths::log("info", &format!("page ready: {a}"));
                if self.opts.diagnose { self.opts.diagnose = false; self.eval(sid, &json!({ "event": "open-settings", "data": "diagnostics" })); }
                if self.cfg.host_u64("bootFailures") >= 3 { self.eval(sid, &json!({ "event": "toast", "data": { "message": "Mecord is in safe mode after repeated failed starts", "type": "warning" } })); }
            }
            "log" => paths::log(a["lvl"].as_str().unwrap_or("info"), &format!("[{}] {}", a["name"].as_str().unwrap_or("?"), a["text"].as_str().unwrap_or(""))),
            "page-error" => paths::log("warn", &format!("page error: {}", a["msg"].as_str().unwrap_or(""))),
            // In safe mode the page only has a stripped view of the config; never let it overwrite the real one.
            "config.save" => { if !self.safe_now() { self.cfg.merge_from_page(&a["config"]); } }
            "host.clearSafeMode" => { self.cfg.set_host("bootFailures", json!(0)); self.respond(sid, id, Ok(json!(true))); }
            "storage.get" | "storage.set" => {
                let p = a["plugin"].as_str().unwrap_or("");
                let r = (|| -> Result<Value, String> {
                    if !paths::valid_id(p) { return Err("bad plugin id".into()) }
                    let f = paths::storage().join(format!("{p}.json"));
                    let mut m = paths::read_json(&f).unwrap_or(json!({}));
                    let key = a["key"].as_str().ok_or("bad key")?;
                    if op == "storage.get" { return Ok(m[key].clone()) }
                    let v = a["value"].clone();
                    if v.to_string().len() > 2_000_000 { return Err("value too large".into()) }
                    m[key] = v;
                    paths::write_json(&f, &m).map_err(|e| e.to_string())?;
                    Ok(Value::Null)
                })();
                self.respond(sid, id, r);
            }
            "open.folder" => {
                // Fixed set of folders only; the page can't make us open arbitrary paths.
                let dir = match a["which"].as_str() { Some("themes") => paths::themes(), Some("userplugins") => paths::userplugins(), Some("backups") => paths::backups(), Some("logs") => paths::logs(), _ => paths::root().to_path_buf() };
                let _ = std::process::Command::new("explorer.exe").arg(dir).spawn();
                self.respond(sid, id, Ok(json!(true)));
            }
            "file.serve" => { let r = fileserve::serve(a["path"].as_str().unwrap_or("")).map(|u| json!({ "url": u })); self.respond(sid, id, r); }
            "userplugin.create" => {
                let r = plugins::scaffold_user_patch(a["id"].as_str().unwrap_or(""), a["find"].as_str().unwrap_or(""), a["match"].as_str().unwrap_or(""), a["replace"].as_str().unwrap_or(""))
                    .map(|p| json!({ "path": p.to_string_lossy() })).map_err(|e| e.to_string());
                let r = if a["id"].as_str().map(paths::valid_id) == Some(true) { r } else { Err("invalid plugin name".into()) };
                self.respond(sid, id, r);
            }
            "store.index" => {
                let (base, min) = (self.store_base(), self.cfg.host_u64("storeMinVersion"));
                spawn(Box::new(move || match store::load_index(&base, min) {
                    Ok(idx) => Reply { res: Some(Ok(store::public_list(&idx))), min_version: idx.json["version"].as_u64(), ..Default::default() },
                    Err(e) => Reply { res: Some(Ok(json!({ "plugins": [], "error": format!("{e:#}") }))), ..Default::default() },
                }));
            }
            "store.install" => {
                let (base, min, pid) = (self.store_base(), self.cfg.host_u64("storeMinVersion"), a["id"].as_str().unwrap_or("").to_string());
                let is_theme = a["kind"] == "theme";
                spawn(Box::new(move || {
                    let res = store::load_index(&base, min).and_then(|idx| {
                        if is_theme { store::install_theme(&idx, &pid, &base).map(|e| ("theme.added", e)) }
                        else { store::install(&idx, &pid, &base).map(|e| ("plugin.added", e)) }
                    });
                    match res {
                        Ok((event, entry)) => Reply { res: Some(Ok(json!(true))), events: vec![(event.into(), entry)], ..Default::default() },
                        Err(e) => err(format!("{e:#}")),
                    }
                }));
            }
            "store.uninstall" => {
                let pid = a["id"].as_str().unwrap_or("");
                let removed = if a["kind"] == "theme" { store::uninstall_theme(pid) } else { native::stop(pid); store::uninstall(pid) };
                let r = removed.map(|_| json!(true)).map_err(|e| e.to_string());
                if r.is_ok() && a["kind"] != "theme" { self.broadcast("plugin.removed", &json!({ "id": pid })); }
                self.respond(sid, id, r);
            }
            "log.tail" => {
                // The last lines of the log, for the Log tab. Bounded so a huge log can't flood the page.
                let n = a["lines"].as_u64().unwrap_or(200).min(2000) as usize;
                let text = std::fs::read_to_string(paths::logs().join("mecord.log")).unwrap_or_default();
                let lines: Vec<&str> = text.lines().collect();
                let tail = lines[lines.len().saturating_sub(n)..].join("\n");
                self.respond(sid, id, Ok(json!({ "text": tail })));
            }
            "diagnostics.export" => {
                // A text file for a bug report: the page's report (no settings, no passwords) plus the recent log.
                let report = a["report"].as_str().unwrap_or("");
                let log = std::fs::read_to_string(paths::logs().join("mecord.log")).unwrap_or_default();
                let lines: Vec<&str> = log.lines().collect();
                let recent = lines[lines.len().saturating_sub(300)..].join("\n");
                let text = format!("Mecord diagnostics\n===================\n\n{report}\n\nRecent log\n----------\n{recent}\n");
                let path = paths::logs().join(format!("diagnostics-{}.txt", paths::now()));
                let r = std::fs::write(&path, text).map(|_| json!({ "path": path.to_string_lossy() })).map_err(|e| e.to_string());
                self.respond(sid, id, r);
            }
            "net.fetch" => {
                let pid = a["plugin"].as_str().unwrap_or("").to_string();
                let allow = self.net_allow(&pid);
                spawn(Box::new(move || match net_fetch(allow, &a["url"], &a["init"]) { Ok(v) => ok(v), Err(e) => err(e.to_string()) }));
            }
            "native.consent" => {
                let pid = a["id"].as_str().unwrap_or("").to_string();
                spawn(Box::new(move || match native::request_consent(&pid) {
                    Ok(sha) => Reply { res: Some(Ok(json!(true))), consent: Some((pid, sha)), ..Default::default() },
                    Err(e) => err(e.to_string()),
                }));
            }
            "native.call" => {
                let pid = a["plugin"].as_str().unwrap_or("").to_string();
                let consent = self.cfg.v["consent"].clone();
                spawn(Box::new(move || match native::call(&pid, a["method"].as_str().unwrap_or(""), &a["args"], &consent) { Ok(v) => ok(v), Err(e) => err(format!("{e:#}")) }));
            }
            "theme.add" => {
                spawn(Box::new(move || match themes::add_url(a["url"].as_str().unwrap_or("")) { Ok(v) => ok(v), Err(e) => err(e.to_string()) }));
            }
            "theme.remove" => { themes::remove_url(a["id"].as_str().unwrap_or("")); self.respond(sid, id, Ok(json!(true))); }
            "backup.export" => {
                let r = backup::export(&self.cfg.v, &a["secrets"], &plugins::installed_map()).map(|p| json!({ "path": p.to_string_lossy() })).map_err(|e| e.to_string());
                self.respond(sid, id, r);
            }
            "backup.import" => {
                let (cur, base, min) = (self.cfg.v.clone(), self.store_base(), self.cfg.host_u64("storeMinVersion"));
                spawn(Box::new(move || {
                    let imp = match backup::import(&cur, a["json"].as_str().unwrap_or(""), a["mode"].as_str().unwrap_or("merge"), a["overwriteCss"].as_bool().unwrap_or(false)) { Ok(i) => i, Err(e) => return err(e.to_string()) };
                    let mut notes = vec![];
                    let have = plugins::installed_map();
                    let need: Vec<&String> = imp.to_install.iter().filter(|p| !have.contains_key(*p)).collect();
                    if !need.is_empty() {
                        match store::load_index(&base, min) {
                            Ok(idx) => for p in need { match store::install(&idx, p, &base) { Ok(_) => notes.push(format!("installed {p}")), Err(e) => notes.push(format!("{p}: {e:#}")) } },
                            Err(e) => notes.push(format!("store unavailable, plugins not installed: {e:#}")),
                        }
                    }
                    let mut s = imp.summary;
                    if !notes.is_empty() { s.push_str(&format!(" [{}]", notes.join("; "))); }
                    Reply { res: Some(Ok(json!({ "summary": s }))), set_config: Some(imp.cfg), ..Default::default() }
                }));
            }
            "gpu.status" => { let r = self.gpu_status(); self.respond(sid, id, r); }
            "discord.restart" => {
                // A native dialog, not a page prompt, so the page cannot fake or skip the confirmation.
                let ok = ui::confirm("Mecord", "Restart Discord now to apply the graphics settings?\n\nUnsent message drafts may be lost.");
                if ok { self.restart = true; }
                self.respond(sid, id, Ok(json!(ok)));
            }
            other => self.respond(sid, id, Err(format!("unknown op {other}"))),
        }
    }

    /// What Chromium reports about the GPU and which accelerated features it enabled, for the Health page.
    /// `featureStatus` is a flat map of feature name → state; this build reports no active-device flag or problem list.
    fn gpu_status(&mut self) -> Result<Value, String> {
        let info = self.cdp.call(None, "SystemInfo.getInfo", json!({})).map_err(|e| format!("{e:#}"))?;
        let gpu = &info["gpu"];
        let devices: Vec<Value> = gpu["devices"].as_array().map_or(vec![], |a| a.iter().map(|d| json!({
            "name": d["deviceString"], "driver": d["driverVersion"],
        })).collect());
        Ok(json!({
            "devices": devices,
            "features": gpu["featureStatus"],
            "driverWorkarounds": gpu["driverBugWorkarounds"].as_array().map_or(0, |a| a.len()),
        }))
    }

    fn net_allow(&self, plugin: &str) -> Option<Vec<String>> {
        let inst = plugins::installed_map();
        let ver = inst.get(plugin)?.as_str()?;
        let meta = paths::read_json(&plugins::store_dir(plugin, ver).join("meta.json"))?;
        Some(meta["capabilities"].as_array().cloned().unwrap_or_default().iter().filter_map(|c| c.as_str()?.strip_prefix("net:").map(String::from)).collect())
    }

    fn init(&mut self, sid: &str) -> Result<Value, String> {
        if let Some(s) = self.sess.get_mut(sid) { s.booted = Some(Instant::now()); }
        let safe = self.safe_now();
        let mut cfg = self.cfg.v.clone();
        let mut plist: Vec<Value> = vec![];
        if !safe {
            cfg["themes"] = json!(themes::assemble(&cfg["themes"]));
            plist.extend(plugins::store_entries());
            for (pid, entry, stamp) in plugins::user_sources() {
                if plist.iter().any(|p| p["id"] == pid) { paths::log("warn", &format!("user plugin {pid} shadows a store plugin; ignored")); continue }
                self.user.insert(pid.clone(), stamp);
                plist.push(plugins::user_entry(&pid, &entry).unwrap_or_else(|e| { paths::log("warn", &format!("compile {pid}: {e}")); plugins::broken_entry(&pid, &e) }));
            }
        } else { cfg["themes"] = json!([]); cfg["quickCss"] = json!(""); cfg["wallpaper"]["kind"] = json!("none"); }
        if let Some(o) = cfg.as_object_mut() { o.remove("host"); }
        Ok(json!({ "config": cfg, "plugins": plist, "info": { "version": env!("CARGO_PKG_VERSION"), "discordVersion": self.opts.discord_version, "safe": safe, "root": paths::root().to_string_lossy() } }))
    }
}

fn net_fetch(allow: Option<Vec<String>>, url: &Value, init: &Value) -> Result<Value> {
    let url = url.as_str().unwrap_or("");
    let rest = url.strip_prefix("https://").or_else(|| if allow.is_none() { url.strip_prefix("http://") } else { None });
    let Some(rest) = rest else { bail!("only https URLs are allowed") };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("").rsplit('@').next().unwrap_or("").split(':').next().unwrap_or("").to_lowercase();
    if let Some(list) = &allow {
        let ok = list.iter().any(|h| h == "*" || *h == host || host.ends_with(&format!(".{h}")));
        if !ok { bail!("plugin has no net:{host} capability") }
    }
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).redirects(3).build();
    let mut req = agent.request(init["method"].as_str().unwrap_or("GET"), url);
    if let Some(h) = init["headers"].as_object() { for (k, v) in h { if let Some(v) = v.as_str() { req = req.set(k, v); } } }
    let resp = match init["body"].as_str() { Some(b) => req.send_string(b), None => req.call() };
    let resp = match resp { Ok(r) => r, Err(ureq::Error::Status(_, r)) => r, Err(e) => bail!("{e}") };
    let status = resp.status();
    let headers: serde_json::Map<String, Value> = resp.headers_names().into_iter().filter_map(|n| resp.header(&n).map(|v| (n.clone(), json!(v)))).collect();
    let mut buf = vec![];
    resp.into_reader().take(5 * 1024 * 1024).read_to_end(&mut buf)?;
    Ok(json!({ "status": status, "headers": headers, "text": String::from_utf8_lossy(&buf) }))
}
