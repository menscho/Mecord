// Plugin manager: loading, per-plugin lifecycle, hot reload, settings, and the @mecord/api surface.
import { call, notify } from "./bridge";
import { logger, Logger } from "./log";
import * as W from "./webpack";
import { addPatch, removePluginPatches, PatchDef } from "./webpack";
import { Commands, CommandDef, ContextMenu, Dispose, Flux, Stores, Styles, Toasts, Utils, h, MenuCtx, MenuItem } from "./features";
import { Keybinds } from "./keybinds";
import { LayoutId, Tweaks, DEFAULT_TWEAKS } from "./layouts";
import { onBatch, watch, within } from "./dom";

export type SettingDef =
  | { type: "boolean"; default: boolean; label: string; description?: string }
  | { type: "string"; default: string; label: string; description?: string; secret?: boolean; placeholder?: string }
  | { type: "number"; default: number; label: string; description?: string; min?: number; max?: number }
  | { type: "select"; default: string; label: string; description?: string; options: { label: string; value: string }[] };
export type SettingsSchema = Record<string, SettingDef>;

export interface PluginCtx {
  id: string;
  log: Logger;
  settings: { get<T = any>(k: string): T; set(k: string, v: any): void; all(): Record<string, any>; onChange(fn: (k: string, v: any) => void): Dispose };
  add(d: Dispose): void;
  net: { fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; text: string; json(): any }> };
  native: { call<T = any>(method: string, args?: any): Promise<T> };
  storage: { get<T = any>(k: string, d?: T): Promise<T>; set(k: string, v: any): Promise<void> };
  /** Page changes, from one shared observer. Subscriptions are removed when the plugin stops. */
  dom: {
    onBatch(fn: (roots: Element[]) => void): Dispose;
    watch(selector: string, fn: (el: Element) => void): Dispose;
    within(roots: Element[], selector: string): Element[];
  };
  every(ms: number, fn: () => void, opts?: { pauseWhenHidden?: boolean }): Dispose;
}

export interface PluginDef {
  name?: string;
  description?: string;
  settings?: SettingsSchema;
  patches?: PatchDef[];
  commands?: CommandDef[];
  flux?: Record<string, (e: any) => void>;
  styles?: string;
  contextMenu?: (ctx: MenuCtx) => MenuItem[] | void;
  start?(ctx: PluginCtx): void | Promise<void>;
  stop?(ctx: PluginCtx): void;
  renderSettings?(el: HTMLElement, ctx: PluginCtx): void;
  [k: string]: any;
}
export const definePlugin = <T extends PluginDef>(d: T): T => d;

export interface PluginEntry {
  id: string; name: string; version: string; description?: string; author?: string;
  origin: "store" | "user" | "builtin";
  source: string;
  native?: { kind: string; sha256: string } | null;
  capabilities?: string[];
  tags?: string[];
  /** One of the categories in plugins/categories (chat, typing, look, ...). Missing means "other". */
  category?: string;
  /** Store entries come from a signed index; the page shows this as "Signed". */
  verified?: boolean;
}
export interface LoadedPlugin {
  entry: PluginEntry;
  def: PluginDef | null;
  state: "stopped" | "started" | "error";
  error?: string;
  ctx: PluginCtx | null;
  disposers: Dispose[];
  /** How long the last start() took, shown in Health. */
  startMs?: number;
}

const log = logger("Plugins");
export const loaded = new Map<string, LoadedPlugin>();
const changeListeners = new Set<() => void>();
export const onPluginsChanged = (fn: () => void) => (changeListeners.add(fn), () => changeListeners.delete(fn));
const changed = () => changeListeners.forEach(f => { try { f(); } catch {} });

// ---- config ----
export interface ThemeEntry { builtin?: boolean; id: string; name: string; enabled: boolean; url?: string; css?: string; meta?: Record<string, string>; file?: string; error?: string; updated?: number; /** "store" for themes installed from the catalog. */ origin?: string }
export interface Wallpaper { kind: "none" | "image" | "video"; src: string; opacity: number; blur: number; dim: number }
/** How the look is arranged: which layout overrides the theme's, the tweaks, and automatic light/dark switching. */
export interface Look {
  layout: LayoutId | "";
  tweaks: Tweaks;
  auto: { enabled: boolean; dark: string; light: string };
  /** Plugins Mecord switched on because the active theme asked for them. Switched off again when the theme changes. */
  autoEnabled: string[];
}
export interface Profile { id: string; name: string; theme: string; layout: LayoutId | ""; tweaks: Tweaks; plugins: string[]; wallpaper: Wallpaper }
export interface Config {
  plugins: Record<string, { enabled: boolean; settings: Record<string, any> }>;
  themes: ThemeEntry[];
  quickCss: string;
  wallpaper: Wallpaper;
  ui: { button: boolean };
  consent: Record<string, string>; // native plugin id -> consented helper sha256
  keybinds: Record<string, string>; // shortcut id -> combo ("" = unbound)
  favorites: string[];
  profiles: Profile[];
  look: Look;
}
export const defaultLook = (): Look => ({ layout: "", tweaks: { ...DEFAULT_TWEAKS }, auto: { enabled: false, dark: "builtin-midnight-ink", light: "builtin-paper" }, autoEnabled: [] });
export const config: Config = {
  plugins: {}, themes: [], quickCss: "", wallpaper: { kind: "none", src: "", opacity: 1, blur: 0, dim: 0.35 }, ui: { button: true }, consent: {},
  keybinds: {}, favorites: [], profiles: [], look: defaultLook(),
};
export function setConfig(c: Partial<Config>) { Object.assign(config, c); }
let saveTimer: any;
export function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => notify("config.save", { config }), 150);
}

const pc = (id: string) => (config.plugins[id] ??= { enabled: false, settings: {} });
export const isEnabled = (id: string) => !!config.plugins[id]?.enabled;

function schemaDefault(def: PluginDef | null, k: string) { return def?.settings?.[k]?.default; }

function makeCtx(entry: PluginEntry, lp: LoadedPlugin): PluginCtx {
  const id = entry.id;
  const subs = new Set<(k: string, v: any) => void>();
  const plog = logger(entry.name || id);
  const track = (d: Dispose) => (lp.disposers.push(d), d);
  return {
    id,
    log: plog,
    settings: {
      get: <T,>(k: string) => (pc(id).settings[k] ?? schemaDefault(lp.def, k)) as T,
      set(k, v) { pc(id).settings[k] = v; saveConfig(); subs.forEach(f => f(k, v)); },
      all() { const o: Record<string, any> = {}; for (const k of Object.keys(lp.def?.settings ?? {})) o[k] = pc(id).settings[k] ?? schemaDefault(lp.def, k); return o; },
      onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    },
    add: d => lp.disposers.push(d),
    net: {
      async fetch(url, init) {
        const r = await call("net.fetch", { plugin: id, url, init });
        return { ...r, json: () => JSON.parse(r.text) };
      },
    },
    native: { call: (method, args) => call("native.call", { plugin: id, method, args }) },
    storage: {
      get: async <T,>(k: string, d?: T) => ((await call("storage.get", { plugin: id, key: k })) ?? d) as T,
      set: async (k, v) => { await call("storage.set", { plugin: id, key: k, value: v }); },
    },
    dom: {
      onBatch: fn => track(onBatch(fn)),
      watch: (selector, fn) => track(watch(selector, fn)),
      within,
    },
    every: (ms, fn, opts) => {
      const t = setInterval(() => {
        if (opts?.pauseWhenHidden && document.hidden) return;
        try { fn(); } catch (e) { plog.error("timer", e); }
      }, ms);
      return track(() => clearInterval(t));
    },
  };
}

/** Errors thrown by plugin hooks called from patched Discord code must never break Discord. */
const proxies = new Map<string, any>();
export function self(id: string) {
  let p = proxies.get(id);
  if (!p) {
    p = new Proxy({}, {
      get(_, prop) {
        const def = loaded.get(id)?.def as any;
        const v = def?.[prop];
        if (typeof v !== "function") return v;
        return (...args: any[]) => { try { return v.apply(def, args); } catch (e) { rateLimitedError(id, String(prop), e); return undefined; } };
      },
    });
    proxies.set(id, p);
  }
  return p;
}
const errCounts = new Map<string, number>();
function rateLimitedError(id: string, where: string, e: any) {
  const k = id + ":" + where, n = (errCounts.get(k) ?? 0) + 1;
  errCounts.set(k, n);
  if (n <= 3 || n % 500 === 0) log.error(`${id}.${where} threw (#${n})`, e);
}

function evalPlugin(entry: PluginEntry): PluginDef {
  const module: any = { exports: {} };
  const req = (name: string) => {
    if (name === "@mecord/api") return api;
    throw new Error(`plugin ${entry.id}: cannot require "${name}"`);
  };
  const fn = new Function("module", "exports", "require", "Mecord", `${entry.source}\n//# sourceURL=mecord-plugin/${entry.id}.js`);
  fn(module, module.exports, req, (window as any).Mecord);
  const def = module.exports?.default ?? module.exports;
  if (!def || typeof def !== "object") throw new Error("plugin must export a default object (use definePlugin)");
  return def;
}

/** Evaluate a plugin and register its patches. Does not call start(). */
export function load(entry: PluginEntry) {
  const prev = loaded.get(entry.id);
  const lp: LoadedPlugin = { entry, def: null, state: "stopped", ctx: null, disposers: [] };
  try {
    lp.def = evalPlugin(entry);
    pc(entry.id); // ensure config slot
    const keep = new Set<string>();
    if (isEnabled(entry.id)) {
      for (const p of lp.def.patches ?? []) {
        const rec = addPatch(entry.id, { ...p, predicate: p.predicate ?? (() => isEnabled(entry.id)) });
        keep.add(rec.key);
      }
    }
    removePluginPatches(entry.id, keep);
  } catch (e: any) {
    lp.state = "error"; lp.error = String(e?.stack ?? e);
    log.error(`failed to load ${entry.id}`, e);
  }
  loaded.set(entry.id, lp);
  return prev ? { prev, lp } : { prev: undefined, lp };
}

export async function start(id: string) {
  const lp = loaded.get(id);
  if (!lp || !lp.def || lp.state === "started") return;
  const def = lp.def;
  const ctx = (lp.ctx = makeCtx(lp.entry, lp));
  const t0 = performance.now();
  try {
    for (const p of def.patches ?? []) {
      const rec = addPatch(id, { ...p, predicate: p.predicate ?? (() => isEnabled(id)) });
      void rec;
    }
    if (def.styles) lp.disposers.push(Styles.set("plugin-" + id, def.styles));
    for (const c of def.commands ?? []) lp.disposers.push(Commands.register(c));
    for (const [t, fn] of Object.entries(def.flux ?? {})) lp.disposers.push(Flux.subscribe(t, fn.bind(def)));
    if (def.contextMenu) lp.disposers.push(ContextMenu.register(c => def.contextMenu!.call(def, c)));
    await def.start?.(ctx);
    lp.state = "started"; lp.error = undefined;
    lp.startMs = performance.now() - t0;
  } catch (e: any) {
    lp.state = "error"; lp.error = String(e?.stack ?? e);
    log.error(`${id} failed to start`, e);
    Toasts.show(`Plugin "${lp.entry.name}" failed to start`, "error");
    stopDisposers(lp);
  }
  changed();
}

function stopDisposers(lp: LoadedPlugin) {
  for (const d of lp.disposers.splice(0).reverse()) { try { d(); } catch (e) { log.error("dispose", e); } }
}

export function stop(id: string) {
  const lp = loaded.get(id);
  if (!lp) return;
  try { if (lp.state === "started" && lp.ctx) lp.def?.stop?.(lp.ctx); } catch (e) { log.error(`${id} stop()`, e); }
  stopDisposers(lp);
  if (lp.state !== "error") lp.state = "stopped";
  changed();
}

/** Stop and start an enabled plugin again, e.g. after its settings were reset. */
export async function restart(id: string) {
  if (!loaded.get(id) || !isEnabled(id)) return;
  stop(id);
  await start(id);
}

export async function setEnabled(id: string, on: boolean) {
  pc(id).enabled = on;
  saveConfig();
  const lp = loaded.get(id);
  if (!lp) return;
  if (on) {
    for (const p of lp.def?.patches ?? []) addPatch(id, { ...p, predicate: p.predicate ?? (() => isEnabled(id)) });
    await start(id);
  } else stop(id);
  changed();
}

/** Hot reload a single plugin: stop old instance, load new code, start if enabled. */
export async function reload(entry: PluginEntry) {
  const old = loaded.get(entry.id);
  if (old) stop(entry.id);
  const { lp } = load(entry);
  if (lp.state !== "error" && isEnabled(entry.id)) await start(entry.id);
  Toasts.show(lp.state === "error" ? `${entry.name}: reload failed` : `Reloaded ${entry.name}`, lp.state === "error" ? "error" : "success", { duration: 1800 });
  changed();
}

export function unload(id: string) {
  stop(id);
  removePluginPatches(id);
  loaded.delete(id);
  proxies.delete(id);
  changed();
}

// ---- the @mecord/api object plugins `require` ----
export const api = {
  definePlugin,
  Webpack: W,
  Flux, Commands, ContextMenu, Toasts, Styles, Stores, Utils, h, Keybinds,
  get React() { return W.getReact(); },
  definePatch: (p: PatchDef) => p,
};
