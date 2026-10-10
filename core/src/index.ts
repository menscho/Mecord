import { call, notify, onHost } from "./bridge";
import { logger } from "./log";
import * as W from "./webpack";
import { api, config, setConfig, saveConfig, load, start, reload, unload, isEnabled, loaded, self, PluginEntry, Config } from "./plugins";
import { Commands, Toasts } from "./features";
import { applyAll, updateTheme } from "./themes";
import { installKeybinds, setKeybindOverrides, setKeybindSaver } from "./keybinds";
import { applyAutoNow, registerLookKeybinds, setLooksHook, startAutoLook } from "./looks";
import { initUI, setHostInfo, open as openUI, refreshStore, repaintWindow, showDetails } from "./ui";
import { startJankMonitor } from "./perf";

const log = logger("Core");
const w = window as any;

async function boot() {
  if (w.__mecord) return;
  const safe = !!w.__mecordSafe;
  w.__mecord = true;
  w.Mecord = {
    version: "0.1.0",
    api,
    plugins: { self, loaded, load, reload, unload },
    commands: Commands,
    webpack: W,
    openSettings: openUI,
  };
  window.addEventListener("error", e => notify("page-error", { msg: String(e.error?.stack ?? e.message).slice(0, 1500), src: e.filename }));
  window.addEventListener("unhandledrejection", e => notify("page-error", { msg: String((e.reason as any)?.stack ?? e.reason) }));

  // Shortcuts and the M button work even in safe mode, so the window can always be reached.
  installKeybinds();
  registerLookKeybinds();
  setKeybindSaver(() => saveConfig());
  setLooksHook(repaintWindow);

  if (!safe) {
    W.installHook();
    corePatches();
    startJankMonitor();
  }

  const init = await call<{ config: Config; plugins: PluginEntry[]; info: any }>("init");
  setHostInfo({ ...init.info, safe });
  setConfig(init.config);
  setKeybindOverrides(config.keybinds);
  const ready = () => document.readyState !== "loading" ? Promise.resolve() : new Promise<void>(r => document.addEventListener("DOMContentLoaded", () => r(), { once: true }));

  if (!safe) {
    for (const p of init.plugins) load(p);
    await ready();
    applyAll();
  }
  await ready();
  initUI();

  if (safe) { notify("ready", { safe: true }); Toasts.show("Mecord safe mode: plugins and themes are off", "warning", { duration: 6000 }); return; }

  // Wire host events (hot reload, installs, theme updates).
  onHost("plugin.update", async (e: PluginEntry) => { await reload(e); });
  onHost("plugin.discovered", (e: PluginEntry) => { load(e); });
  onHost("toast", (d: any) => Toasts.show(d.message, d.type ?? "info", {
    duration: 6000,
    action: d.detail ? { label: "Details", run: () => showDetails(d.title ?? "Details", String(d.detail)) } : undefined,
  }));
  onHost("plugin.added", async (e: PluginEntry) => {
    // Native-code plugins stay off until the user consents (host-shown dialog) when toggling them on.
    if (!config.plugins[e.id]) config.plugins[e.id] = { enabled: !e.native, settings: {} };
    else if (!e.native) config.plugins[e.id].enabled = true;
    else config.plugins[e.id].enabled = false;
    load(e);
    if (loaded.get(e.id)?.state !== "error" && isEnabled(e.id)) await start(e.id);
    notify("config.save", { config });
  });
  onHost("plugin.removed", (d: { id: string }) => unload(d.id));
  onHost("theme.update", (t: any) => updateTheme(t));
  // A theme just installed from the store: add it (disabled); the Themes page switches it on.
  onHost("theme.added", (t: any) => { updateTheme(t); saveConfig(); });
  onHost("config", (c: Config) => { setConfig(c); setKeybindOverrides(config.keybinds); applyAll(); });
  onHost("store.updated", () => { void refreshStore(); });
  onHost("open-settings", (tab?: string) => openUI((tab as any) ?? undefined));

  await W.waitForRequire();
  // Start enabled plugins once Discord's main modules exist.
  const t0 = performance.now();
  const wait = setInterval(async () => {
    const n = W.wreq ? Object.keys(W.wreq.c).length : 0;
    if (n > 1000 || performance.now() - t0 > 20000) {
      clearInterval(wait);
      const s0 = performance.now();
      // Plugins don't depend on each other, so they start together; a slow start only delays itself.
      await Promise.all([...loaded.keys()].filter(isEnabled).map(id => start(id)));
      const startedIn = Math.round(performance.now() - s0);
      // Automatic light and dark only switches the theme once the plugins it may turn on are ready.
      startAutoLook();
      void applyAutoNow();
      const timing = { waitedMs: Math.round(s0 - t0), pluginsMs: startedIn, pageMs: Math.round(performance.now()) };
      notify("ready", { modules: n, plugins: loaded.size, patches: W.patches.length, ...timing });
      log.info(`ready: ${loaded.size} plugins, ${W.patches.length} patches, plugins started in ${startedIn} ms`);
    }
  }, 50);
}

/** Core-owned patches: let plugins register slash commands. */
function corePatches() {
  W.addPatch("mecord-core", {
    label: "Slash command registry",
    find: "getBuiltInCommands",
    replacement: {
      match: /(let (\i)=\i\?\i:\i,\i=\i\.getConfig\(\{location:"getBuiltInCommands"\}\)\.enabled;return )\2\.filter\(/,
      replace: "$1Mecord.commands._wrap($2).filter(",
    },
  });
}

boot().catch(e => { console.error("[Mecord] boot failed", e); notify("page-error", { msg: "boot failed: " + String(e?.stack ?? e) }); });
