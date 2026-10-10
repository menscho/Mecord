// Command palette: one box to reach any page, plugin, theme, layout, profile or shortcut action.
import { call } from "../bridge";
import { h, Toasts } from "../features";
import { config, loaded, isEnabled, setEnabled } from "../plugins";
import { BUILTIN_THEMES } from "../builtin-themes";
import { LAYOUTS, layoutName } from "../layouts";
import { applyTheme, applyLayout, applyProfile, captureLook } from "../looks";
import { applyAll } from "../themes";
import { Keybinds, effectiveCombo } from "../keybinds";
import { S, PAGES, Page, hooks, queryWords, matchesAll, openFolder } from "./shell";
import { loadStore } from "./plugins-page";
import { report } from "./health-page";

interface Item { group: string; label: string; hint?: string; run: () => void }
let host: HTMLElement | null = null;
let onClosed: (() => void) | null = null;

export const paletteOpen = () => !!host;
export function closePalette() {
  if (!host) return;
  host.remove(); host = null;
  const done = onClosed; onClosed = null;
  done?.();
}

function collect(openTo: (p: Page) => void): Item[] {
  const out: Item[] = [];
  const reopen = () => hooks.refresh();
  for (const p of PAGES) out.push({ group: "Go to", label: p.label, run: () => openTo(p.id) });

  for (const lp of loaded.values()) {
    const id = lp.entry.id, on = isEnabled(id);
    const needsConsent = !on && !!lp.entry.native && config.consent[id] !== lp.entry.native.sha256;
    out.push({ group: "Plugins", label: `${on ? "Turn off" : "Turn on"} ${lp.entry.name}`, hint: needsConsent ? "asks first" : on ? "on" : "off",
      run: needsConsent ? () => openTo("plugins") : async () => { await setEnabled(id, !on); reopen(); } });
    out.push({ group: "Plugins", label: `Options: ${lp.entry.name}`, hint: lp.entry.origin, run: () => { S.sub.plugins = "installed"; S.open.add(id); openTo("plugins"); } });
  }

  for (const b of BUILTIN_THEMES) out.push({ group: "Themes", label: `Theme: ${b.name}`, hint: `${b.mode} · ${layoutName(b.layout)}`,
    run: async () => { await applyTheme(b.id); applyAll(); reopen(); Toasts.show(`Applied ${b.name}`, "success", { duration: 2400 }); } });
  out.push({ group: "Themes", label: "Theme: Discord default", hint: "no theme",
    run: async () => { await applyTheme(""); applyAll(); reopen(); } });
  for (const t of config.themes.filter(t => !t.builtin && t.css)) {
    out.push({ group: "Themes", label: `Your theme: ${t.name}`, hint: t.enabled ? "on" : "off",
      run: () => { t.enabled = !t.enabled; applyAll(); reopen(); } });
  }

  for (const l of LAYOUTS) out.push({ group: "Layouts", label: `Layout: ${l.name}`, hint: l.blurb.split(".")[0], run: () => { applyLayout(l.id); applyAll(); reopen(); } });
  out.push({ group: "Layouts", label: "Layout: the theme's own", run: () => { applyLayout(""); applyAll(); reopen(); } });

  for (const p of config.profiles) out.push({ group: "Profiles", label: `Apply profile: ${p.name}`,
    run: async () => { const snap = captureLook("Undo"); await applyProfile(p); applyAll(); reopen(); Toasts.show(`Applied ${p.name}`, "success", { duration: 7000, action: { label: "Undo", run: async () => { await applyProfile(snap); applyAll(); reopen(); } } }); } });

  for (const d of Keybinds.list()) out.push({ group: "Actions", label: d.label, hint: effectiveCombo(d) || "", run: () => d.run() });
  out.push({ group: "Actions", label: "Reload Discord UI", run: () => location.reload() });
  out.push({ group: "Actions", label: "Check the store for updates", run: () => { void loadStore(true); Toasts.show("Checking the store…", "info", { duration: 1800 }); } });
  out.push({ group: "Actions", label: "Export diagnostics", run: () => { call("diagnostics.export", { report: report() }).then(() => Toasts.show("Diagnostics saved", "success"), (e: any) => Toasts.show(e.message, "error")); } });
  out.push({ group: "Actions", label: "Open the plugins folder", run: () => openFolder("userplugins") });
  out.push({ group: "Actions", label: "Open the themes folder", run: () => openFolder("themes") });
  out.push({ group: "Actions", label: "Open the logs folder", run: () => openFolder("logs") });
  return out;
}

/** Opens the palette over the page. `openTo` brings the Mecord window to a page; `onClose` lets the frame release Discord again. */
export function openPalette(openTo: (p: Page) => void, parent: HTMLElement, onClose?: () => void) {
  if (host) { closePalette(); return; }
  onClosed = onClose ?? null;
  const input = h("input", { type: "text", placeholder: "Find a plugin, theme, layout, profile or action…", "aria-label": "Command palette", autocomplete: "off", spellcheck: false }) as HTMLInputElement;
  const list = h("div", { class: "pl", role: "listbox" });
  const wrap = h("div", { class: "root palwrap" }, h("div", { class: "palette", role: "dialog", "aria-label": "Command palette" }, input, list));
  wrap.addEventListener("mousedown", e => { if (e.target === wrap) closePalette(); });
  wrap.addEventListener("keydown", e => e.stopPropagation());
  host = wrap;
  parent.append(wrap);

  const items = collect(openTo);
  let shown: Item[] = [], sel = 0;
  const run = (i: number) => {
    const it = shown[i];
    if (!it) return;
    closePalette();
    try { it.run(); } catch (e) { console.error("[Mecord] palette action", e); }
  };
  const draw = () => {
    const words = queryWords(input.value);
    shown = items.filter(it => matchesAll(`${it.group} ${it.label} ${it.hint ?? ""}`.toLowerCase(), words)).slice(0, 80);
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    list.replaceChildren();
    let last = "";
    shown.forEach((it, i) => {
      if (it.group !== last) { list.append(h("div", { class: "plg" }, it.group)); last = it.group; }
      list.append(h("button", { class: "pli", role: "option", "aria-selected": String(i === sel), onmouseenter: () => { sel = i; highlightSel(); }, onclick: () => run(i) },
        h("span", null, it.label), h("span", { class: "g" }, it.hint ?? "")));
    });
    if (!shown.length) list.append(h("div", { class: "empty" }, "Nothing matches. Try a shorter word."));
  };
  const highlightSel = () => {
    list.querySelectorAll('[role="option"]').forEach((el, i) => el.setAttribute("aria-selected", String(i === sel)));
    (list.querySelector('[aria-selected="true"]') as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); highlightSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); highlightSel(); }
    else if (e.key === "Enter") { e.preventDefault(); run(sel); }
  });
  draw();
  input.focus();
}
