// Webpack chunk hook, lazy patching of module factories, and module/store finders.
import { logger } from "./log";

const log = logger("Webpack");

export type PatchState = "pending" | "applied" | "nomatch" | "evalerror" | "needs-reload" | "disabled" | "stale";

export interface Replacement {
  match: string | RegExp;
  replace: string | ((substr: string, ...groups: any[]) => string);
}
export interface PatchDef {
  find: string | RegExp;
  replacement: Replacement | Replacement[];
  predicate?: () => boolean;
  /** Human label for diagnostics. */
  label?: string;
}
export interface PatchRecord {
  key: string;
  plugin: string;
  def: PatchDef;
  state: PatchState;
  moduleId?: string;
  detail?: string;
}

type Factory = ((...a: any[]) => any) & { __mecordOrig?: Function; __mecordId?: string };

export const patches: PatchRecord[] = [];
export let wreq: any = null;
const wreqWaiters: Array<(r: any) => void> = [];
export const stats = { factories: 0, patched: 0, hookedAt: 0, arrays: 0 };

const ID = "[A-Za-z_$][\\w$]*";
const expandIds = (src: string) => src.replace(/\\i/g, `(?:${ID})`);
function toRegex(m: string | RegExp): RegExp | string {
  if (typeof m === "string") return m;
  return new RegExp(expandIds(m.source), m.flags);
}
function matches(find: string | RegExp, code: string) {
  const f = toRegex(find);
  return typeof f === "string" ? code.includes(f) : f.test(code);
}
const patchKey = (plugin: string, def: PatchDef) =>
  plugin + "::" + String(def.find) + "::" + [def.replacement].flat().map(r => String(r.match) + "=>" + String(r.replace)).join("|");

function selfRef(plugin: string) { return `Mecord.plugins.self(${JSON.stringify(plugin)})`; }

export function addPatch(plugin: string, def: PatchDef): PatchRecord {
  const key = patchKey(plugin, def);
  let rec = patches.find(p => p.key === key);
  if (rec) { rec.def = def; if (rec.state === "stale") rec.state = "applied"; return rec; }
  rec = { key, plugin, def, state: "pending", detail: def.label };
  patches.push(rec);
  // Late registration: apply now to any module that has not executed yet.
  if (wreq) applyLate(rec);
  return rec;
}

export function removePluginPatches(plugin: string, keep: Set<string> = new Set()) {
  for (let i = patches.length - 1; i >= 0; i--) {
    const p = patches[i];
    if (p.plugin !== plugin || keep.has(p.key)) continue;
    if (p.state === "applied") { p.state = "stale"; p.detail = "removed; reload Discord to undo the code change"; }
    else patches.splice(i, 1);
  }
}

function applyLate(rec: PatchRecord) {
  if (rec.def.predicate && !safe(rec.def.predicate)) { rec.state = "disabled"; return; }
  for (const id of Object.keys(wreq.m)) {
    const f = wreq.m[id] as Factory;
    const code = Function.prototype.toString.call(f.__mecordOrig ?? f);
    if (!matches(rec.def.find, code)) continue;
    rec.moduleId = id;
    if (wreq.c[id]) { rec.state = "needs-reload"; rec.detail = "module already executed"; return; }
    const orig = (f.__mecordOrig ?? f) as Factory;
    wreq.m[id] = wrapFactory(id, orig);
    return;
  }
}

const safe = (fn: () => any) => { try { return fn(); } catch { return false; } };

/** Applies every matching patch to a factory's source; returns the new factory (or the original on total failure). */
export function patchFactory(id: string, orig: Factory): Factory {
  let code0 = Function.prototype.toString.call(orig);
  // Factories defined with object-method shorthand stringify as `12345(e,t,n){…}`, which isn't an expression.
  if (!/^(async\s|function[\s(*]|\(|[A-Za-z_$][\w$]*\s*=>)/.test(code0)) code0 = "function" + code0.slice(code0.indexOf("("));
  let code = code0;
  const applied: PatchRecord[] = [];
  for (const rec of patches) {
    if (rec.state === "disabled" || rec.state === "stale") continue;
    if (rec.def.predicate && !safe(rec.def.predicate)) { rec.state = "disabled"; continue; }
    if (!matches(rec.def.find, code0)) continue;
    rec.moduleId = id;
    let next = code;
    let ok = true;
    for (const r of [rec.def.replacement].flat()) {
      const m = toRegex(r.match);
      const rep = typeof r.replace === "string" ? r.replace.replace(/\$self/g, selfRef(rec.plugin)) : r.replace;
      const out = next.replace(m as any, rep as any);
      if (out === next) { ok = false; rec.state = "nomatch"; rec.detail = `replacement did not match: ${String(r.match).slice(0, 120)}`; break; }
      next = out;
    }
    if (!ok) { log.warn(`patch ${rec.plugin} did not match in module ${id}`); continue; }
    // Test-compile this patch alone before committing it to the shared source.
    try { (0, eval)("0," + next + "\n//# sourceURL=MecordProbe"); }
    catch (e: any) { rec.state = "evalerror"; rec.detail = String(e?.message ?? e); log.warn(`patch ${rec.plugin} produced invalid code in module ${id}: ${rec.detail}`); continue; }
    code = next;
    applied.push(rec);
  }
  if (!applied.length) return orig;
  try {
    const f = (0, eval)(`// Webpack Module ${id} - Patched by ${[...new Set(applied.map(a => a.plugin))].join(", ")}\n0,${code}\n//# sourceURL=MecordWebpack/${id}`) as Factory;
    for (const a of applied) { a.state = "applied"; a.detail = a.def.label; }
    stats.patched++;
    f.__mecordOrig = orig;
    return f;
  } catch (e: any) {
    for (const a of applied) { a.state = "evalerror"; a.detail = String(e?.message ?? e); }
    return orig;
  }
}

function wrapFactory(id: string, orig: Factory): Factory {
  if ((orig as any).__mecordWrapped) return orig;
  let real: Factory | null = null;
  const w: Factory = function (this: any, ...args: any[]) {
    if (!real) { try { real = patchFactory(id, orig); } catch (e) { log.error("patchFactory", e); real = orig; } }
    return real.apply(this, args);
  };
  w.__mecordOrig = orig;
  w.__mecordId = id;
  (w as any).__mecordWrapped = true;
  w.toString = () => Function.prototype.toString.call(orig);
  return w;
}

function wrapChunk(chunk: any) {
  const mods = chunk?.[1];
  if (!mods || typeof mods !== "object") return;
  for (const id of Object.keys(mods)) {
    const f = mods[id];
    if (typeof f !== "function" || f.__mecordWrapped) continue;
    mods[id] = wrapFactory(id, f);
    stats.factories++;
  }
}

function captureRequire(arr: any, push: Function) {
  try {
    push.call(arr, [[Symbol("mecord")], {}, (r: any) => {
      if (r?.c && r?.m && (!wreq || Object.keys(r.m).length > Object.keys(wreq.m).length)) {
        wreq = r;
        // Modules that ship inside the entry bundle never pass through push(); wrap the ones that haven't run yet.
        for (const id of Object.keys(r.m)) if (!r.c[id] && typeof r.m[id] === "function" && !r.m[id].__mecordWrapped) { r.m[id] = wrapFactory(id, r.m[id]); stats.factories++; }
        wreqWaiters.splice(0).forEach(w => w(r));
      }
    }]);
  } catch (e) { log.error("captureRequire", e); }
}

const NAME = "webpackChunkdiscord_app";
const hooked = new WeakSet<object>();

function hookArray(arr: any) {
  if (hooked.has(arr)) return;
  hooked.add(arr);
  stats.arrays++;
  stats.hookedAt = performance.now();
  const nativePush = Array.prototype.push;
  // Existing entries (a previous hook, or modules registered before us).
  for (const c of arr) wrapChunk(c);
  // Before webpack's runtime starts, `push` is the native method. webpack then does
  //   arr.push = callback.bind(null, arr.push.bind(arr))
  // i.e. it reads our getter (and keeps that as the "parent" push) and then assigns its callback.
  // The getter must therefore keep returning a wrapper around the *native* push until the assignment,
  // otherwise the callback would call itself through us. After the assignment, we wrap the callback.
  // Several webpack runtimes can share this array and each chains onto whatever it read, so every
  // value that was ever assigned gets its own fixed wrapper (a wrapper that always dispatches to the
  // *latest* value would be re-entered by the next runtime's callback and recurse forever).
  let current: Function = (Object.getOwnPropertyDescriptor(arr, "push")?.value as Function) ?? nativePush;
  const wrappers = new Map<Function, Function>();
  const wrapperFor = (fn: Function) => {
    let w = wrappers.get(fn);
    if (!w) {
      w = function (this: any, ...chunks: any[]) { for (const c of chunks) wrapChunk(c); return fn.apply(arr, chunks); };
      wrappers.set(fn, w);
    }
    return w;
  };
  Object.defineProperty(arr, "push", {
    configurable: true,
    get() { return wrapperFor(current); },
    // Capture synchronously: the runtime may start executing modules before the next tick.
    set(v) { current = v; captureRequire(arr, wrapperFor(current)); },
  });
  if (current !== nativePush) captureRequire(arr, wrapperFor(current)); // array whose runtime already started
}

export function installHook() {
  const w = window as any;
  if (w[NAME]) { hookArray(w[NAME]); }
  else {
    let val: any;
    try {
      Object.defineProperty(w, NAME, {
        configurable: true,
        get: () => val,
        set(v) { val = v; if (Array.isArray(v)) hookArray(v); },
      });
    } catch (e) { log.warn("could not define chunk setter", e); }
  }
  // Fallback if another mod replaced our accessor: poll for an unhooked array.
  const t = setInterval(() => {
    const a = w[NAME];
    if (Array.isArray(a) && !hooked.has(a)) hookArray(a);
    if (wreq && Object.keys(wreq.c).length > 500) clearInterval(t);
  }, 250);
}

export function waitForRequire(): Promise<any> {
  return wreq ? Promise.resolve(wreq) : new Promise(r => wreqWaiters.push(r));
}

// ---------- finders ----------
type Filter = (exp: any, id: string) => boolean;

function* exportsOf(m: any): Generator<any> {
  const e = m?.exports;
  if (!e) return;
  yield e;
  if (typeof e === "object" || typeof e === "function") {
    for (const k in e) {
      let v: any;
      try { v = e[k]; } catch { continue; }
      if (v && (typeof v === "object" || typeof v === "function")) yield v;
    }
  }
}

export function findAll(filter: Filter, limit = 100): any[] {
  if (!wreq) return [];
  const out: any[] = [];
  for (const id in wreq.c) {
    for (const e of exportsOf(wreq.c[id])) {
      let ok = false;
      try { ok = filter(e, id); } catch {}
      if (ok) { out.push(e); if (out.length >= limit) return out; break; }
    }
  }
  return out;
}
export const find = (filter: Filter) => findAll(filter, 1)[0];
/** Flux stores are Proxies that claim to have any property, so action/util lookups must skip them. */
const isStore = (e: any) => { try { return e?._dispatchToken !== undefined; } catch { return false; } };
// A finder scans every loaded module (about 10 ms), so a successful lookup is remembered. Modules don't change once
// loaded, but the remembered export is checked again on each use, so a stale entry just triggers a new scan.
const found = new Map<string, any>();
const hasProps = (e: any, props: string[]) => props.every(p => { try { return typeof e[p] !== "undefined"; } catch { return false; } });
export function findByProps(...props: string[]) {
  const key = "p:" + props.join("\u0001");
  const hit = found.get(key);
  if (hit !== undefined && hasProps(hit, props)) return hit;
  const e = find(e => !isStore(e) && hasProps(e, props));
  if (e !== undefined) found.set(key, e);
  return e;
}
export function findByCode(...needles: string[]) {
  const key = "c:" + needles.join("\u0001");
  const hit = found.get(key);
  if (hit !== undefined && typeof hit === "function" && needles.every(n => String(hit).includes(n))) return hit;
  const e = find(e => typeof e === "function" && needles.every(n => String(e).includes(n)));
  if (e !== undefined) found.set(key, e);
  return e;
}

let storeCache: Map<string, any> | null = null;
let storeScanAt = 0;
export function findStore(name: string) {
  if (!wreq) return undefined;
  const hit = storeCache?.get(name);
  if (hit) return hit;
  // A full scan costs about 40 ms, so a name that isn't there is searched for again at most every two seconds.
  if (storeCache && performance.now() - storeScanAt < 2000) return undefined;
  storeCache = storeCache ?? new Map();
  storeScanAt = performance.now();
  for (const id in wreq.c) {
    for (const e of exportsOf(wreq.c[id])) {
      try { if (typeof e?.getName === "function" && e._dispatchToken !== undefined) storeCache.set(e.getName(), e); } catch {}
    }
  }
  return storeCache.get(name);
}

export function lazy<T>(factory: () => T): () => T {
  let v: T | undefined, done = false;
  return () => { if (!done) { v = factory(); if (v !== undefined) done = true; } return v as T; };
}

export const getReact = lazy<any>(() => find(e => e?.useState && e?.createElement && e?.useEffect));
export const getReactDOM = lazy<any>(() => find(e => e?.createRoot && e?.version && e?.createPortal) ?? find(e => e?.render && e?.createPortal));
export const getDispatcher = lazy<any>(() =>
  find(e => e && typeof e.dispatch === "function" && typeof e.subscribe === "function" && typeof e.unsubscribe === "function" && "_actionHandlers" in e));

/** Source of a module factory by id, for the diagnostics and patch editor. */
export function moduleSource(id: string): string | null {
  const f = wreq?.m?.[id];
  return f ? Function.prototype.toString.call(f.__mecordOrig ?? f) : null;
}
export function searchModules(needle: string | RegExp, limit = 30): { id: string; loaded: boolean; len: number }[] {
  if (!wreq) return [];
  const out: { id: string; loaded: boolean; len: number }[] = [];
  const rx = typeof needle === "string" ? null : new RegExp(expandIds(needle.source), needle.flags);
  for (const id of Object.keys(wreq.m)) {
    const code = moduleSource(id)!;
    if (rx ? rx.test(code) : code.includes(needle as string)) { out.push({ id, loaded: !!wreq.c[id], len: code.length }); if (out.length >= limit) break; }
  }
  return out;
}
export const regexFromSource = (src: string, flags = "") => new RegExp(expandIds(src), flags);
