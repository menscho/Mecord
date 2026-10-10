// Shared state, widgets and helpers for the Mecord window. Pages build on these; index.ts owns the frame and dispatch.
import { call } from "../bridge";
import { h, Toasts } from "../features";
import type { LoadedPlugin, PluginEntry } from "../plugins";

export type Page = "plugins" | "themes" | "style" | "keys" | "health" | "backup";
export const PAGES: { id: Page; label: string; icon: string; title: string; sub: string }[] = [
  { id: "plugins", label: "Plugins", icon: "plugins", title: "Plugins", sub: "Turn features on or off, change their options, and find new ones." },
  { id: "themes", label: "Themes", icon: "themes", title: "Themes & layouts", sub: "Pick a look and an arrangement. Changes apply instantly." },
  { id: "style", label: "Style", icon: "style", title: "Style", sub: "Your own CSS, a wallpaper behind the chat, and the window itself." },
  { id: "keys", label: "Shortcuts", icon: "keys", title: "Keyboard shortcuts", sub: "Every shortcut in one place. Change one by pressing the keys you want." },
  { id: "health", label: "Health", icon: "health", title: "Health", sub: "See what Mecord changed in Discord, what needs attention, and why." },
  { id: "backup", label: "Backup", icon: "backup", title: "Backup & restore", sub: "Move your setup to another PC or roll back a mistake." },
];

/** Plugin categories. Plugins declare one with `// @category`; the rest fall back to their tags. */
export const CATEGORIES: { id: string; label: string }[] = [
  { id: "chat", label: "Chat" }, { id: "typing", label: "Typing & input" }, { id: "look", label: "Look" },
  { id: "layout", label: "Layout & clutter" }, { id: "privacy", label: "Privacy" }, { id: "media", label: "Media" },
  { id: "tools", label: "Tools" }, { id: "developer", label: "Developer" }, { id: "other", label: "Other" },
];
export const catLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label ?? "Other";
const TAG_CAT: Record<string, string> = { chat: "chat", translation: "chat", "context-menu": "chat", cosmetic: "look", privacy: "privacy", media: "media", commands: "tools", utility: "tools", fun: "tools", native: "tools", developer: "developer", performance: "developer", shortcuts: "typing" };
export function catOf(e: { category?: string; tags?: string[] }): string {
  if (e.category && CATEGORIES.some(c => c.id === e.category)) return e.category;
  for (const t of e.tags ?? []) if (TAG_CAT[t]) return TAG_CAT[t];
  return "other";
}

export interface StoreData { plugins: any[]; themes: any[]; verified?: boolean; error?: string }
export interface Trial { id: string; prevTheme: string; prevLayout: string; until: number; timer?: any; label?: HTMLElement }

/** The window's state. Lives for the page session; the parts worth keeping are in `prefs` (saved per viewer). */
export const S = {
  host: null as HTMLElement | null,
  scrim: null as HTMLElement | null,
  page: "plugins" as Page,
  sub: { plugins: "installed", themes: "themes", style: "css", health: "patches", keys: "all" } as Record<string, string>,
  hostInfo: {} as any,
  store: null as StoreData | null,
  storeAt: 0,
  storeBusy: false,
  open: new Set<string>(),
  trial: null as Trial | null,
  recording: null as string | null,
  q: "",
  searchInput: null as HTMLInputElement | null,
  titleDot: null as HTMLElement | null,
};

export interface Prefs { view: "list" | "grid"; sort: "category" | "name" | "enabled"; status: string; bStatus: string; cats: string[]; tags: string[] }
export const prefs: Prefs = { view: "list", sort: "category", status: "all", bStatus: "all", cats: [], tags: [] };

export const mem = (k: string, v?: string): string | null => {
  try {
    if (v === undefined) return localStorage.getItem("mecord." + k);
    localStorage.setItem("mecord." + k, v);
  } catch { /* storage can be unavailable; the window still works without it */ }
  return null;
};
export function loadPrefs() {
  try { Object.assign(prefs, JSON.parse(mem("prefs") ?? "{}")); } catch { /* ignore a corrupt value */ }
}
export function savePrefs() { mem("prefs", JSON.stringify(prefs)); }

// ---------------- icons (static strings, never user input) ----------------
const ICONS: Record<string, string> = {
  plugins: '<path d="M9 3v4M15 3v4M7 7h10v5a5 5 0 0 1-10 0V7zM12 17v4"/>',
  themes: '<path d="M12 3a9 9 0 0 0 0 18c1.7 0 2.3-1.2 1.6-2.4-.7-1.2 0-2.6 1.4-2.6H17a4 4 0 0 0 4-4 9 9 0 0 0-9-9z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  style: '<path d="M4 20l4-1 10-10-3-3L5 16l-1 4zM14 6l3 3"/>',
  keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  health: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  backup: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2m0 4v-4h-4"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
};
export function icon(name: string, cls = ""): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("stroke-width", "1.7"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  if (cls) s.setAttribute("class", cls);
  s.innerHTML = ICONS[name] ?? ""; // static strings above, never user input
  return s;
}

// ---------------- widgets ----------------
export function sw(checked: boolean, label: string, onchange: (v: boolean) => void) {
  const b = h("button", { class: "sw", role: "switch", "aria-checked": String(checked), "aria-label": label });
  b.addEventListener("click", () => { const v = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(v)); onchange(v); });
  return b;
}
export const pill = (t: string, cls = "") => h("span", { class: "pill " + cls }, t);
export function seg(items: [string, string][], cur: string, on: (id: string) => void) {
  return h("div", { class: "seg", role: "group" }, ...items.map(([id, label]) => h("button", { "aria-pressed": String(cur === id), onclick: () => on(id) }, label)));
}
export function chip(label: string, pressed: boolean, onclick: () => void, count?: number) {
  return h("button", { class: "chip", "aria-pressed": String(pressed), onclick }, label, count !== undefined && h("span", { class: "c" }, String(count)));
}
export function btn(label: string, onclick: (e: Event) => void, kind = "", ic = "") {
  return h("button", { class: "btn " + kind, onclick }, ic ? icon(ic) : null, label);
}
/** Search input that keeps its value across re-renders and remembers the element for `/` and Escape. */
export function searchBox(value: string, placeholder: string, on: (v: string) => void) {
  const i = h("input", { type: "search", placeholder, value, "aria-label": placeholder, autocomplete: "off", spellcheck: false }) as HTMLInputElement;
  const clear = h("button", { class: "clr", "aria-label": "Clear search", title: "Clear (Esc)", onclick: () => { i.value = ""; on(""); i.focus(); } }, icon("close"));
  const wrap = h("div", { class: "search" }, icon("search"), i, i.value ? clear : null);
  i.addEventListener("input", () => { on(i.value); if (!wrap.contains(clear)) wrap.append(clear); if (!i.value) clear.remove(); });
  S.searchInput = i;
  return wrap;
}

export function modal(title: string, body: Node[], ok: string, danger = false, root: HTMLElement | null = S.host): Promise<boolean> {
  return new Promise(res => {
    const w = h("div", { class: "root modalwrap" });
    const done = (v: boolean) => { w.remove(); res(v); };
    const okb = btn(ok, () => done(true), danger ? "danger" : "primary");
    w.append(h("div", { class: "modal", role: "alertdialog", "aria-label": title }, h("h3", null, title), ...body, h("div", { class: "acts" }, btn("Cancel", () => done(false), "ghost"), okb)));
    w.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); done(false); } });
    (root ?? document.body).append(w); okb.focus();
  });
}
/** A read-only text dialog with a copy button. */
export function infoModal(title: string, text: string) {
  const w = h("div", { class: "root modalwrap" });
  const close = () => w.remove();
  w.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  w.addEventListener("mousedown", e => { if (e.target === w) close(); });
  w.append(h("div", { class: "modal", role: "dialog", "aria-label": title, style: { width: "min(640px,94vw)" } },
    h("h3", null, title), h("pre", null, text), h("div", { class: "acts" },
      btn("Copy", () => { navigator.clipboard?.writeText(text).then(() => Toasts.show("Copied", "success")).catch(() => {}); }, "ghost", "copy"),
      btn("Close", close, "primary"))));
  (S.host ?? document.body).append(w);
}

export const openFolder = (which: string) => call("open.folder", { which }).catch(() => {});

/** Highlight each query word inside `text`. Returns plain text when there is no query. */
export function highlight(text: string, words: string[]): (string | HTMLElement)[] {
  if (!words.length || !text) return [text];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${words.map(esc).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? h("mark", null, part) : part)).filter(p => p !== "");
}
export const queryWords = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
/** Every query word must appear somewhere in the haystack. */
export const matchesAll = (hay: string, words: string[]) => words.every(w => hay.includes(w));

export const storeFor = (id: string) => S.store?.plugins.find((p: any) => p.id === id);
export const storeHasUpdate = (lp: LoadedPlugin) => { const s = storeFor(lp.entry.id); return !!s && lp.entry.origin === "store" && s.version !== lp.entry.version; };
export const entryCat = (e: PluginEntry) => catOf(e);

// ---------------- hooks the frame installs ----------------
/** Pages call these; index.ts fills them in. */
export const hooks = { render: () => {}, refresh: () => {} };

/** Page mount contract: build into the three slots, optionally return a refresh for the list area. */
export type Mount = (tools: HTMLElement, head: HTMLElement, body: HTMLElement) => (() => void) | void;
