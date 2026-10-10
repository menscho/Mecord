//! Persistent configuration: a single JSON document the page also holds a copy of.
use crate::paths;
use serde_json::{json, Value};

pub struct Config {
    pub v: Value,
}

fn default() -> Value {
    json!({
        "plugins": {},
        "themes": [],
        "quickCss": "",
        "wallpaper": { "kind": "none", "src": "", "opacity": 1, "blur": 0, "dim": 0.35 },
        "ui": { "button": true },
        // Shortcut rebinds: { "<id>": "Ctrl+Alt+Z" }. Missing ids keep their default combo.
        "keybinds": {},
        // Plugin ids pinned to the top of the Plugins page.
        "favorites": [],
        // Saved setups: theme, layout, tweaks, plugins and wallpaper, applied together.
        "profiles": [],
        // The look in use: a layout override, tweaks, automatic light/dark, and plugins a theme switched on.
        "look": {
            "layout": "",
            "tweaks": { "accent": "", "radius": 12, "density": "default", "textSize": 0 },
            "auto": { "enabled": false, "dark": "builtin-midnight-ink", "light": "builtin-paper" },
            "autoEnabled": []
        },
        "consent": {},
        "host": { "bootFailures": 0, "storeMinVersion": 0, "storeUrl": "" }
    })
}

impl Config {
    pub fn load() -> Self {
        let mut v = paths::read_json(&paths::root().join("config.json")).unwrap_or_else(default);
        // Fill any missing top-level keys from defaults.
        if let (Some(o), Some(d)) = (v.as_object_mut(), default().as_object()) {
            for (k, dv) in d { o.entry(k.clone()).or_insert(dv.clone()); }
        }
        Self { v }
    }
    pub fn save(&self) {
        // CSS bodies, parse results and transient errors are rebuilt from disk/URL, so don't persist them.
        let mut v = self.v.clone();
        if let Some(ts) = v["themes"].as_array_mut() {
            for t in ts { if let Some(o) = t.as_object_mut() { for k in ["css", "meta", "error", "updated"] { o.remove(k); } } }
        }
        if let Err(e) = paths::write_json(&paths::root().join("config.json"), &v) { paths::log("error", &format!("config save: {e}")); }
    }
    /// Replace the page-owned portion of the config; host-owned keys (`host`, `consent`) are kept.
    pub fn merge_from_page(&mut self, page: &Value) {
        let Some(po) = page.as_object() else { return };
        for k in ["plugins", "themes", "quickCss", "wallpaper", "ui", "keybinds", "favorites", "profiles", "look"] {
            if let Some(val) = po.get(k) { self.v[k] = val.clone(); }
        }
        self.save();
    }
    pub fn host_u64(&self, k: &str) -> u64 { self.v["host"][k].as_u64().unwrap_or(0) }
    pub fn set_host(&mut self, k: &str, val: Value) { self.v["host"][k] = val; self.save(); }
}
