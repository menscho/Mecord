// The Mecord window: the frame around every page, the Escape and "/" rules, Discord's title-bar button, and the focus
// rules that keep typing in the window from reaching Discord. The window lives in the page (not a shadow root), so the
// browser's own focus and keyboard handling work inside it; Discord's app is made inert while the window is open.
import { h } from "../features";
import * as W from "../webpack";
import { config, loaded, onPluginsChanged } from "../plugins";
import { Keybinds, effectiveCombo, escapeHooks } from "../keybinds";
import { paint } from "../tokens";
import { CSS } from "./styles";
import { S, PAGES, Page, Mount, hooks, icon, mem, loadPrefs, storeHasUpdate, infoModal } from "./shell";
import { mountTitleButton, refreshTitleButton, tintTitleButton, setTitleDot } from "./titlebtn";
import { mountPlugins, onStore, installSearchEscape, loadStore } from "./plugins-page";
import { mountThemes } from "./themes-page";
import { mountStyle } from "./style-page";
import { mountKeys } from "./keys-page";
import { mountHealth } from "./health-page";
import { mountBackup } from "./backup-page";
import { openPalette, closePalette, paletteOpen } from "./palette";

const ID = "mecord-ui";
const MOUNTS: Record<Page, Mount> = { plugins: mountPlugins, themes: mountThemes, style: mountStyle, keys: mountKeys, health: mountHealth, backup: mountBackup };

/** Names a caller can open directly: a page, or a page with one of its sub-tabs selected. */
const ALIAS: Record<string, [Page, string?, string?]> = {
  store: ["plugins", "plugins", "browse"], plugins: ["plugins", "plugins", "installed"],
  themes: ["themes", "themes", "themes"], layouts: ["themes", "themes", "layouts"], profiles: ["themes", "themes", "profiles"],
  style: ["style", "style", "css"], quickcss: ["style", "style", "css"], wallpaper: ["style", "style", "wallpaper"], window: ["style", "style", "interface"],
  health: ["health", "health", "patches"], diagnostics: ["health", "health", "patches"], patcher: ["health", "health", "editor"],
  logs: ["health", "health", "logs"], startup: ["health", "health", "startup"],
  keys: ["keys"], shortcuts: ["keys"], backup: ["backup"],
};

let head!: HTMLElement, tools!: HTMLElement, body!: HTMLElement;
/** The current page's list refresh. Pages return one when they can redraw just their list, keeping the search box focused. */
let refresh: (() => void) | null = null;
/** Where focus was before the window opened, so closing it puts the cursor back. */
let returnTo: HTMLElement | null = null;

/** Prefix every selector with the window's id, so Discord's own rules can't reach the window and the window's rules win on equal specificity. */
function scope(css: string, id: string): string {
  const walk = (src: string): string => {
    let out = "", i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      const sel = src.slice(i, open).trim();
      let depth = 1, k = open + 1;
      while (k < src.length && depth) { const c = src[k++]; if (c === "{") depth++; else if (c === "}") depth--; }
      const block = src.slice(open + 1, k - 1);
      if (/^@(media|supports)/.test(sel)) out += `${sel}{${walk(block)}}`;
      else if (sel.startsWith("@")) out += `${sel}{${block}}`; // keyframes: their steps are not selectors
      else out += sel.split(",").map(s => `${id} ${s.trim()}`).join(",") + `{${block}}`;
      i = k;
    }
    return out;
  };
  return walk(css.replace(/\/\*[\s\S]*?\*\//g, ""));
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};
const comboOf = (id: string) => { const d = Keybinds.list().find(k => k.id === id); return d ? effectiveCombo(d) : ""; };
function attention() {
  return [...loaded.values()].filter(p => p.state === "error").length + W.patches.filter(p => p.state === "nomatch" || p.state === "evalerror").length;
}
function mark() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("stroke-width", "2.2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<path d="M5.5 18.5V6l6.5 8.2L18.5 6v12.5"/>'; // static markup
  return s;
}

/** Discord's app is inert while Mecord has the screen, so nothing can take focus or keys away from the window. */
function syncLock() {
  document.getElementById("app-mount")?.toggleAttribute("inert", !!S.scrim || paletteOpen());
}

/** Update dots on the Plugins row and the title button. Safe to call with the window closed. */
function updateDots() {
  const updates = [...loaded.values()].filter(storeHasUpdate).length;
  setTitleDot(updates > 0);
  const row = S.scrim?.querySelector('.nav[data-page="plugins"]');
  row?.querySelector(".dot.acc")?.remove();
  if (updates) row?.append(h("span", { class: "dot acc", title: `${updates} update${updates === 1 ? "" : "s"} available` }));
}

function navigate(name: string) {
  const a: [Page, string?, string?] | undefined = ALIAS[name] ?? (PAGES.some(p => p.id === name) ? [name as Page] : undefined);
  if (!a) return;
  S.page = a[0];
  if (a[1] && a[2]) S.sub[a[1]] = a[2];
  mem("page", S.page);
}

function mountPage() {
  const r = MOUNTS[S.page](tools, head, body);
  refresh = typeof r === "function" ? r : null;
  tools.style.display = tools.childElementCount ? "" : "none";
}

/** Draw the whole window: rail, header, tools and the page. Used on open and on a page change. */
function frame() {
  if (!S.scrim) return;
  const issues = attention();
  const on = [...loaded.keys()].filter(id => config.plugins[id]?.enabled).length;
  const info = PAGES.find(p => p.id === S.page) ?? PAGES[0];
  const palette = comboOf("mecord.palette");
  head = h("div", { class: "slot" }); tools = h("div", { class: "tools" }); body = h("div", { class: "body" });
  S.scrim.replaceChildren(h("div", { class: "win", role: "dialog", "aria-label": "Mecord" },
    h("nav", { class: "rail", "aria-label": "Mecord sections" },
      h("div", { class: "brand" }, h("span", { class: "logo" }, mark()), h("b", { class: "display" }, "Mecord"), h("small", null, "v" + (S.hostInfo.version ?? "?"))),
      ...PAGES.map(p => h("button", { class: "nav", "data-page": p.id, "aria-current": p.id === S.page ? "page" : null, onclick: () => { navigate(p.id); frame(); } },
        icon(p.icon), p.label,
        p.id === "plugins" && on ? h("span", { class: "n", title: "Plugins turned on" }, String(on)) : null,
        p.id === "health" && issues ? h("span", { class: "dot", title: issues + " need attention" }) : null)),
      h("div", { class: "grow" }),
      palette && h("div", { class: "hint" }, "Find anything with ", h("kbd", null, palette)),
      h("div", { class: "status" }, h("i", { class: S.hostInfo.safe ? "bad" : issues ? "warn" : "" }),
        S.hostInfo.safe ? "Safe mode: plugins are off" : issues ? `${issues} thing${issues === 1 ? "" : "s"} need attention` : "Everything is running")),
    h("div", { class: "main" },
      h("div", { class: "head" }, h("div", null, h("h1", { class: "display" }, info.title), h("p", null, info.sub)), head,
        h("button", { class: "x", "aria-label": "Close", title: "Close (Esc)", onclick: close }, icon("close"))),
      tools, body)));
  updateDots();
  mountPage();
}

/** Escape: an open palette, popup or dialog first, then the other Escape hooks (such as clearing search), then the window. */
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (paletteOpen()) { e.preventDefault(); e.stopPropagation(); closePalette(); return; }
    if (!S.scrim || S.host?.querySelector(".modalwrap")) return; // a dialog handles its own Escape
    e.preventDefault(); e.stopPropagation();
    if (escapeHooks.some(hook => hook())) return;
    close();
    return;
  }
  if (e.key === "/" && !e.ctrlKey && !e.altKey && !e.metaKey && S.scrim && !isTyping(e.target)) {
    const s = S.searchInput;
    if (s?.isConnected) { e.preventDefault(); s.focus(); s.select(); }
  }
}

/** Build the window's host. Called once at boot, after Discord's page exists. */
export function initUI() {
  if (S.host) return;
  const host = h("div", { id: ID });
  S.host = host;
  host.append(h("style", null, scope(CSS, "#" + ID)));
  document.documentElement.append(host);
  loadPrefs();
  const last = mem("page") as Page | null;
  if (last && PAGES.some(p => p.id === last)) S.page = last;
  // Keys typed in the window stop here, so Discord's document-level shortcuts and type-to-focus never see them.
  host.addEventListener("keydown", e => e.stopPropagation());
  host.addEventListener("keyup", e => e.stopPropagation());
  window.addEventListener("keydown", onKey, true);
  installSearchEscape(escapeHooks);
  onPluginsChanged(() => { if (S.scrim && S.page === "plugins") hooks.refresh(); });
  onStore(updateDots);
  hooks.render = () => { if (S.scrim) frame(); };
  hooks.refresh = () => { if (!S.scrim) return; if (refresh) refresh(); else mountPage(); };
  Keybinds.register({ id: "mecord.toggle", label: "Open or close Mecord", group: "Mecord", combo: "Ctrl+Shift+M", run: toggle });
  Keybinds.register({ id: "mecord.palette", label: "Command palette", group: "Mecord", combo: "Ctrl+Shift+P", run: openPaletteUI });
  mountTitleButton({ enabled: () => config.ui.button, open: () => !!S.scrim, toggle });
  window.addEventListener("mecord:titlebutton", () => refreshTitleButton());
}

export function open(page?: string) {
  if (page) navigate(page);
  if (!S.scrim && S.host) {
    returnTo = document.activeElement as HTMLElement | null;
    S.scrim = h("div", { class: "root scrim", onmousedown: (e: Event) => { if (e.target === S.scrim) close(); } });
    S.host.append(S.scrim);
  }
  if (S.host) paint(S.host, config.look.tweaks.radius);
  frame();
  tintTitleButton();
  syncLock();
}

export function close() {
  if (!S.scrim) return;
  S.scrim.remove(); S.scrim = null; S.searchInput = null;
  tintTitleButton();
  syncLock();
  const back = returnTo; returnTo = null;
  if (back?.isConnected) back.focus();
}

export const toggle = () => { if (S.scrim) close(); else open(); };

function openPaletteUI() {
  if (!S.host) return;
  openPalette(p => open(p), S.host, syncLock);
  syncLock();
}

/** A look changed from outside the window (a profile, a shortcut): repaint the window's colours and page. */
export function repaintWindow() {
  if (S.host) paint(S.host, config.look.tweaks.radius);
  hooks.render();
}
export function setHostInfo(i: any) { S.hostInfo = i; }
/** Re-read the store now. The background check and the update prompts use this. */
export const refreshStore = () => loadStore(true);
/** A read-only text dialog, for compile errors and other details that don't fit a toast. */
export const showDetails = (title: string, text: string) => infoModal(title, text);
