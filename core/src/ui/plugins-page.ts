// Plugins page: installed plugins and the store, with search, categories, tag filters, grouping and per-plugin details.
import { call } from "../bridge";
import { h, Toasts } from "../features";
import { loaded, config, setEnabled, isEnabled, saveConfig, restart, LoadedPlugin, PluginEntry, SettingDef } from "../plugins";
import * as W from "../webpack";
import { S, prefs, savePrefs, CATEGORIES, catOf, catLabel, storeFor, storeHasUpdate, sw, pill, seg, chip, btn, icon, searchBox, modal, queryWords, matchesAll, highlight, hooks, Mount, openFolder, StoreData } from "./shell";

const STORE_TTL = 5 * 60 * 1000;
/** Called when the store data changes, so the title button and rail can show an update dot. */
let storeListener: () => void = () => {};
export const onStore = (fn: () => void) => { storeListener = fn; };

/** Fetch the store index. Shows what we already have straight away, then refreshes in the background. */
export async function loadStore(force = false) {
  if (S.storeBusy || (!force && S.store && Date.now() - S.storeAt < STORE_TTL)) return;
  S.storeBusy = true;
  try {
    S.store = await call<StoreData>("store.index");
  } catch (e: any) {
    S.store = { plugins: S.store?.plugins ?? [], themes: S.store?.themes ?? [], error: String(e?.message ?? e) };
  }
  S.storeBusy = false;
  S.storeAt = Date.now();
  storeListener();
  if (S.scrim && (S.page === "plugins" || S.page === "themes")) hooks.refresh();
}

const issuesOf = (lp: LoadedPlugin) => {
  const patches = W.patches.filter(p => p.plugin === lp.entry.id);
  return { error: lp.state === "error", broken: patches.some(p => ["nomatch", "evalerror"].includes(p.state)), reload: patches.some(p => p.state === "needs-reload") };
};
const hasNative = (e: PluginEntry) => !!e.native;
const consented = (e: PluginEntry) => !e.native || config.consent[e.id] === e.native.sha256;

function settingsOf(lp: LoadedPlugin): [string, SettingDef][] {
  return Object.entries(lp.def?.settings ?? {}) as [string, SettingDef][];
}
const hayInstalled = (lp: LoadedPlugin) => [
  lp.entry.name, lp.entry.id, lp.entry.description ?? "", lp.entry.author ?? "", (lp.entry.tags ?? []).join(" "),
  catLabel(catOf(lp.entry)), (lp.entry.capabilities ?? []).join(" "), settingsOf(lp).map(([, d]) => `${d.label} ${d.description ?? ""}`).join(" "),
].join(" ").toLowerCase();
const hayStore = (p: any) => [p.name, p.id, p.description ?? "", p.author ?? "", (p.tags ?? []).join(" "), catLabel(catOf(p)), (p.capabilities ?? []).join(" ")].join(" ").toLowerCase();

const starred = (id: string) => config.favorites.includes(id);
function toggleFav(id: string) {
  config.favorites = starred(id) ? config.favorites.filter(x => x !== id) : [...config.favorites, id];
  saveConfig(); hooks.refresh();
}
function toggleOpen(id: string) { S.open.has(id) ? S.open.delete(id) : S.open.add(id); hooks.refresh(); }
function toggleTag(t: string) { prefs.tags = prefs.tags.includes(t) ? prefs.tags.filter(x => x !== t) : [...prefs.tags, t]; savePrefs(); hooks.refresh(); }
function toggleCat(c: string) { prefs.cats = prefs.cats.includes(c) ? prefs.cats.filter(x => x !== c) : [...prefs.cats, c]; savePrefs(); hooks.refresh(); }
function clearFilters() { S.q = ""; if (S.searchInput) S.searchInput.value = ""; prefs.cats = []; prefs.tags = []; prefs.status = "all"; prefs.bStatus = "all"; savePrefs(); hooks.refresh(); }

/** Let Escape clear the search box before it closes the window. */
let escapeInstalled = false;
export function installSearchEscape(hookList: (() => boolean)[]) {
  if (escapeInstalled) return;
  escapeInstalled = true;
  hookList.push(() => {
    if (S.page !== "plugins" || !S.q) return false;
    clearFilters();
    return true;
  });
}

/** Turn several plugins on or off in one go, with an Undo that restores the exact previous states. */
async function setMany(items: LoadedPlugin[], on: boolean, label: string) {
  const before = items.map(lp => [lp.entry.id, isEnabled(lp.entry.id)] as const);
  const todo = items.filter(lp => isEnabled(lp.entry.id) !== on && (!on || consented(lp.entry)));
  if (!todo.length) { Toasts.show("Nothing to change", "info", { duration: 1800 }); return; }
  for (const lp of todo) await setEnabled(lp.entry.id, on);
  Toasts.show(`${on ? "Turned on" : "Turned off"} ${todo.length} in ${label}`, "success", {
    duration: 7000,
    action: { label: "Undo", run: async () => { for (const [id, was] of before) if (isEnabled(id) !== was) await setEnabled(id, was); hooks.refresh(); } },
  });
  hooks.refresh();
}

async function consentNative(e: PluginEntry) {
  try { await call("native.consent", { id: e.id }); } catch { return false; }
  config.consent[e.id] = e.native!.sha256;
  return true;
}

function settingRow(pid: string, key: string, def: SettingDef) {
  const cfg = (config.plugins[pid] ??= { enabled: false, settings: {} });
  const val = cfg.settings[key] ?? def.default;
  const set = (v: any) => { const lp = loaded.get(pid); lp?.ctx ? lp.ctx.settings.set(key, v) : (cfg.settings[key] = v, saveConfig()); };
  let ctl: HTMLElement;
  if (def.type === "boolean") ctl = sw(!!val, def.label, set);
  else if (def.type === "select") { const s = h("select", { "aria-label": def.label }, ...def.options.map(o => h("option", { value: o.value, selected: o.value === val }, o.label))); s.addEventListener("change", () => set(s.value)); ctl = s; }
  else if (def.type === "number") { const i = h("input", { type: "number", value: String(val), min: def.min, max: def.max, style: { width: "100px" }, "aria-label": def.label }); i.addEventListener("change", () => set(Number(i.value))); ctl = i; }
  else { const i = h("input", { type: def.secret ? "password" : "text", value: String(val ?? ""), placeholder: def.placeholder, style: { width: "250px" }, "aria-label": def.label }); i.addEventListener("change", () => set(i.value)); ctl = i; }
  return h("div", { class: "set" }, h("div", { class: "l" }, h("b", null, def.label), def.description && h("small", null, def.description)), ctl);
}

async function resetOptions(lp: LoadedPlugin) {
  const id = lp.entry.id;
  const cfg = (config.plugins[id] ??= { enabled: false, settings: {} });
  const snap = { ...cfg.settings };
  cfg.settings = {}; saveConfig();
  if (isEnabled(id)) await restart(id);
  Toasts.show(`Reset ${lp.entry.name} options`, "success", {
    duration: 7000,
    action: { label: "Undo", run: async () => { (config.plugins[id] ??= { enabled: false, settings: {} }).settings = snap; saveConfig(); if (isEnabled(id)) await restart(id); hooks.refresh(); } },
  });
  hooks.refresh();
}

function infoRows(rows: [string, string | Node][]) {
  return h("dl", { class: "info" }, ...rows.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v as any)]));
}

function tagRow(tags: string[] = [], words: string[] = []) {
  return tags.map(t => h("button", { class: "tag", "aria-pressed": String(prefs.tags.includes(t)), title: `Show only plugins tagged ${t}`, onclick: (e: Event) => { e.stopPropagation(); toggleTag(t); } }, t));
}
const capChips = (caps: string[] = []) => caps.map(c => h("span", { class: "cap", title: "Permission this plugin asks for" }, c.replace(/^net:/, "network: ")));

// ---------------- installed ----------------
function installedRow(lp: LoadedPlugin, words: string[]) {
  const e = lp.entry, id = e.id;
  const on = !!config.plugins[id]?.enabled, is = issuesOf(lp);
  const open = S.open.has(id);
  const settings = settingsOf(lp);
  const hasOptions = settings.length > 0 || !!lp.def?.renderSettings;
  const pills = [
    pill("v" + e.version), e.origin === "user" && pill("Yours", "acc"), e.origin === "store" && pill("Signed", "ok"),
    e.native && pill("Native code", "warn"), storeHasUpdate(lp) && pill("Update", "ok"),
    is.error && pill("Error", "bad"), is.broken && pill("Patch broken", "bad"), is.reload && pill("Reload needed", "warn"),
  ];
  const detail = open && h("div", { class: "detail" },
    hasOptions && h("div", { class: "lab", style: { marginBottom: "4px" } }, "Options"),
    ...settings.map(([k, def]) => settingRow(id, k, def)),
    lp.def?.renderSettings && lp.ctx && (() => { const c = h("div", { class: "set", style: { display: "block" } }); try { lp.def!.renderSettings!(c, lp.ctx!); } catch (er) { c.textContent = String(er); } return c; })(),
    lp.def?.renderSettings && !lp.ctx && h("div", { class: "set" }, "Turn the plugin on to edit these options."),
    h("div", { class: "lab", style: { margin: "10px 0 2px" } }, "About"),
    infoRows([
      ["Source", e.origin === "store" ? "Mecord store (signature checked)" : e.origin === "user" ? "Your plugins folder" : "Built in"],
      ["Category", catLabel(catOf(e))],
      ["Author", e.author || "Unknown"],
      ["Permissions", e.capabilities?.length ? capChips(e.capabilities) as any : "None"],
      ["Startup", lp.startMs !== undefined ? `${lp.startMs.toFixed(0)} ms` : "Not started"],
      ["Identifier", id],
    ]),
    h("div", { class: "acts" },
      settings.length > 0 && btn("Reset options", () => resetOptions(lp), "ghost", "refresh"),
      e.origin === "store" && btn("Remove", async () => {
        if (!(await modal(`Remove ${e.name}?`, [h("p", null, "The plugin and its files are deleted. Your settings for it are kept.")], "Remove", true))) return;
        try { await call("store.uninstall", { id }); Toasts.show(`Removed ${e.name}`); } catch (er: any) { Toasts.show(er.message, "error"); }
        setTimeout(() => hooks.refresh(), 300);
      }, "danger")));

  return h("div", { class: "row" + (on ? "" : " off") },
    sw(on, `Turn ${e.name} ${on ? "off" : "on"}`, async v => {
      if (v && hasNative(e) && !consented(e) && !(await consentNative(e))) { hooks.refresh(); return; }
      await setEnabled(id, v); hooks.refresh();
    }),
    h("div", { class: "main" },
      h("div", { class: "t" }, h("button", { class: "nm", onclick: () => toggleOpen(id), "aria-expanded": String(open) }, ...highlight(e.name, words)), ...pills.filter(Boolean) as any[],
        lp.error && pill("Failed", "bad")),
      h("div", { class: "d" }, ...highlight(e.description ?? "", words)),
      lp.error && h("div", { class: "err" }, lp.error.split("\n").slice(0, 3).join("\n")),
      h("div", { class: "m" }, h("span", null, catLabel(catOf(e))), e.author && h("span", null, "by " + e.author), ...tagRow(e.tags), ...capChips(e.capabilities)),
      detail),
    h("div", { class: "a" },
      storeHasUpdate(lp) && btn("Update", async ev => {
        (ev.currentTarget as HTMLButtonElement).setAttribute("disabled", "");
        try { await call("store.install", { id }); Toasts.show(`Updated ${e.name}`, "success"); } catch (er: any) { Toasts.show(er.message, "error"); }
        setTimeout(() => loadStore(true), 400);
      }, "primary"),
      h("button", { class: "star", "aria-pressed": String(starred(id)), "aria-label": starred(id) ? "Unpin" : "Pin to top", title: starred(id) ? "Pinned to the top" : "Pin to the top", onclick: () => toggleFav(id) }, icon("star")),
      btn(open ? "Close" : hasOptions ? "Options" : "Details", () => toggleOpen(id), "ghost", hasOptions ? "gear" : "")));
}

function installedItems(words: string[]) {
  const all = [...loaded.values()];
  return all.filter(lp => {
    const id = lp.entry.id, on = !!config.plugins[id]?.enabled, is = issuesOf(lp);
    if (prefs.status === "on" && !on) return false;
    if (prefs.status === "off" && on) return false;
    if (prefs.status === "updates" && !storeHasUpdate(lp)) return false;
    if (prefs.status === "issues" && !(is.error || is.broken || is.reload)) return false;
    if (prefs.cats.length && !prefs.cats.includes(catOf(lp.entry))) return false;
    if (prefs.tags.length && !prefs.tags.every(t => (lp.entry.tags ?? []).includes(t))) return false;
    return matchesAll(hayInstalled(lp), words);
  });
}

function renderInstalled(list: HTMLElement, banner: HTMLElement, words: string[]) {
  const all = [...loaded.values()];
  const updates = all.filter(storeHasUpdate);
  if (updates.length) banner.append(h("div", { class: "note" }, h("div", { class: "grow" }, h("b", null, `${updates.length} update${updates.length === 1 ? "" : "s"} available`)),
    btn("Update all", async e => {
      (e.currentTarget as HTMLButtonElement).setAttribute("disabled", "");
      for (const lp of updates) { try { await call("store.install", { id: lp.entry.id }); } catch (err: any) { Toasts.show(`${lp.entry.name}: ${err.message}`, "error"); } }
      Toasts.show("Plugins updated", "success"); setTimeout(() => loadStore(true), 400);
    }, "primary", "refresh")));
  const items = installedItems(words);
  if (!items.length) { list.append(emptyState(all.length ? "No plugins match" : "No plugins yet", all.length ? "Try another word, or clear the filters." : "Open Browse to install your first plugin, or drop a .ts file into the plugins folder.")); return; }

  const byName = (a: LoadedPlugin, b: LoadedPlugin) => a.entry.name.localeCompare(b.entry.name);
  if (prefs.sort === "name") { for (const lp of items.sort(byName)) list.append(installedRow(lp, words)); return; }
  if (prefs.sort === "enabled") {
    const sorted = items.sort((a, b) => Number(!!config.plugins[b.entry.id]?.enabled) - Number(!!config.plugins[a.entry.id]?.enabled) || byName(a, b));
    for (const lp of sorted) list.append(installedRow(lp, words));
    return;
  }
  // Grouped by category, with pinned plugins first.
  const pinned = items.filter(lp => starred(lp.entry.id)).sort(byName);
  if (pinned.length) list.append(groupHead("Pinned", pinned), ...pinned.map(lp => installedRow(lp, words)));
  for (const c of CATEGORIES) {
    const members = items.filter(lp => catOf(lp.entry) === c.id && !starred(lp.entry.id)).sort(byName);
    if (!members.length) continue;
    list.append(groupHead(c.label, members), ...members.map(lp => installedRow(lp, words)));
  }
}

function groupHead(label: string, members: LoadedPlugin[]) {
  const on = members.filter(lp => config.plugins[lp.entry.id]?.enabled).length;
  return h("div", { class: "grouphead" }, h("h2", null, label), h("span", null, `${on} of ${members.length} on`),
    h("div", { class: "btns" },
      btn("All on", () => setMany(members, true, label), "ghost sm"),
      btn("All off", () => setMany(members, false, label), "ghost sm")));
}

function emptyState(title: string, text: string) {
  return h("div", { class: "empty" }, h("b", null, title), text,
    (S.q || prefs.cats.length || prefs.tags.length || prefs.status !== "all" || prefs.bStatus !== "all") ?
      h("div", { style: { marginTop: "12px" } }, btn("Clear search and filters", clearFilters, "primary")) : null);
}

// ---------------- store ----------------
function storeRow(p: any, words: string[]) {
  const inst = loaded.get(p.id), upd = !!inst && inst.entry.origin === "store" && inst.entry.version !== p.version;
  const open = S.open.has(p.id);
  const b = btn(inst ? (upd ? "Update" : "Installed") : "Install", async () => {
    b.setAttribute("disabled", "");
    try { await call("store.install", { id: p.id }); Toasts.show(`${inst ? "Updated" : "Installed"} ${p.name}`, "success"); }
    catch (er: any) { Toasts.show("Install failed: " + er.message, "error", { duration: 7000 }); b.removeAttribute("disabled"); }
    setTimeout(() => { loadStore(true); }, 400);
  }, inst && !upd ? "ghost" : "primary", inst && !upd ? "check" : "");
  if (inst && !upd) b.setAttribute("disabled", "");
  return h("div", { class: "row nosw" },
    h("div", { class: "main" },
      h("div", { class: "t" }, h("button", { class: "nm", onclick: () => toggleOpen(p.id), "aria-expanded": String(open) }, ...highlight(p.name, words)),
        pill("v" + p.version), pill("Signed", "ok"), p.native && pill("Native code", "warn"), inst && !upd && pill("Installed", "acc")),
      h("div", { class: "d" }, ...highlight(p.description ?? "", words)),
      h("div", { class: "m" }, h("span", null, catLabel(catOf(p))), p.author && h("span", null, "by " + p.author), ...tagRow(p.tags), ...capChips(p.capabilities)),
      open && h("div", { class: "detail" }, infoRows([
        ["Version", p.version], ["Author", p.author || "Unknown"], ["Category", catLabel(catOf(p))],
        ["Permissions", p.capabilities?.length ? capChips(p.capabilities) as any : "None (no network access)"],
        ["Native code", p.native ? "Yes. Runs a helper program that asks for consent first." : "No"],
        ["Files", String(p.files ?? "?")], ["Checksum", (p.sha256 ?? "").slice(0, 16) + "…"],
      ]))),
    h("div", { class: "a" },
      h("button", { class: "star", "aria-pressed": String(starred(p.id)), "aria-label": starred(p.id) ? "Unpin" : "Pin to top", onclick: () => toggleFav(p.id) }, icon("star")),
      btn(open ? "Close" : "Details", () => toggleOpen(p.id), "ghost"), b));
}

function renderStore(list: HTMLElement, words: string[]) {
  if (!S.store) { list.append(h("div", { class: "empty" }, "Loading the store…")); return; }
  if (S.store.error) {
    list.append(h("div", { class: "note bad" }, h("div", { class: "grow" }, h("b", null, "The store isn't available"), h("div", { class: "err" }, S.store.error)),
      btn("Try again", () => loadStore(true), "primary", "refresh")));
    return;
  }
  const items = S.store.plugins.filter((p: any) => {
    const inst = loaded.get(p.id), upd = !!inst && inst.entry.origin === "store" && inst.entry.version !== p.version;
    if (prefs.bStatus === "new" && inst) return false;
    if (prefs.bStatus === "installed" && !inst) return false;
    if (prefs.bStatus === "updates" && !upd) return false;
    if (prefs.cats.length && !prefs.cats.includes(catOf(p))) return false;
    if (prefs.tags.length && !prefs.tags.every(t => (p.tags ?? []).includes(t))) return false;
    return matchesAll(hayStore(p), words);
  }).sort((a: any, b: any) => a.name.localeCompare(b.name));
  if (!items.length) { list.append(emptyState("Nothing found", "Try another word, or clear the filters.")); return; }
  const groups = prefs.sort === "category" ? CATEGORIES : null;
  if (!groups) { for (const p of items) list.append(storeRow(p, words)); return; }
  for (const c of groups) {
    const members = items.filter((p: any) => catOf(p) === c.id);
    if (!members.length) continue;
    list.append(h("div", { class: "grouphead" }, h("h2", null, c.label), h("span", null, `${members.length} available`)));
    for (const p of members) list.append(storeRow(p, words));
  }
}

// ---------------- page ----------------
export const mountPlugins: Mount = (tools, head, body) => {
  const sub = S.sub.plugins;
  if (sub === "installed") {
    head.append(btn("Plugins folder", () => openFolder("userplugins"), "ghost", "folder"));
    head.append(btn("Turn everything off", async () => {
      const on = [...loaded.values()].filter(lp => isEnabled(lp.entry.id));
      if (!on.length) { Toasts.show("Nothing is on", "info", { duration: 1800 }); return; }
      if (!(await modal("Turn off all plugins?", [h("p", null, `${on.length} plugin${on.length === 1 ? " is" : "s are"} on. Their settings stay as they are, and you can undo this right after.`)], "Turn off", true))) return;
      await setMany([...loaded.values()], false, "everything");
    }, "ghost", "bolt"));
  } else {
    head.append(btn("Refresh store", () => loadStore(true), "ghost", "refresh"));
  }
  const counts = (fn: (lp: LoadedPlugin) => boolean) => [...loaded.values()].filter(fn).length;
  tools.append(h("div", { class: "wraprow" },
    seg([["installed", `Installed ${loaded.size}`], ["browse", `Browse ${S.store?.plugins.length ?? ""}`.trim()]], sub, id => {
      S.sub.plugins = id; S.q = ""; S.open.clear(); hooks.render();
    }),
    searchBox(S.q, sub === "installed" ? "Search names, descriptions, tags, options…" : "Search the store…", v => { S.q = v; hooks.refresh(); }),
    seg([["list", "List"], ["grid", "Grid"]], prefs.view, v => { prefs.view = v as any; savePrefs(); hooks.refresh(); }),
    (() => {
      const s = h("select", { "aria-label": "Sort" },
        ...[["category", "Group by category"], ["name", "Name"], ["enabled", "Turned on first"]].map(([v, l]) => h("option", { value: v, selected: prefs.sort === v }, l)));
      s.addEventListener("change", () => { prefs.sort = s.value as any; savePrefs(); hooks.refresh(); });
      return s;
    })()));

  const statusBox = h("div", { class: "wraprow chips" });
  const tagBox = h("div", { class: "wraprow chips" });
  tools.append(statusBox, tagBox);
  const banner = h("div"), list = h("div", { class: "list" + (prefs.view === "grid" ? " grid" : "") });
  body.append(banner, list);

  if (sub === "browse") void loadStore(false);

  const refresh = () => {
    const words = queryWords(S.q);
    list.className = "list" + (prefs.view === "grid" ? " grid" : "");
    statusBox.replaceChildren();
    tagBox.replaceChildren();
    if (sub === "installed") {
      const opts: [string, string, number][] = [
        ["all", "All", loaded.size], ["on", "On", counts(lp => !!config.plugins[lp.entry.id]?.enabled)],
        ["off", "Off", counts(lp => !config.plugins[lp.entry.id]?.enabled)], ["updates", "Updates", counts(storeHasUpdate)],
        ["issues", "Needs attention", counts(lp => { const i = issuesOf(lp); return i.error || i.broken || i.reload; })],
      ];
      for (const [id, label, n] of opts) statusBox.append(chip(label, prefs.status === id, () => { prefs.status = id; savePrefs(); hooks.refresh(); }, n));
    } else {
      const all = S.store?.plugins ?? [];
      const upd = all.filter((p: any) => { const i = loaded.get(p.id); return !!i && i.entry.origin === "store" && i.entry.version !== p.version; }).length;
      const opts: [string, string, number][] = [
        ["all", "All", all.length], ["new", "Not installed", all.filter((p: any) => !loaded.has(p.id)).length],
        ["installed", "Installed", all.filter((p: any) => loaded.has(p.id)).length], ["updates", "Updates", upd],
      ];
      for (const [id, label, n] of opts) statusBox.append(chip(label, prefs.bStatus === id, () => { prefs.bStatus = id; savePrefs(); hooks.refresh(); }, n));
    }
    // Categories: multi-select, with how many plugins each holds.
    const universe: { category?: string; tags?: string[] }[] = sub === "installed" ? [...loaded.values()].map(lp => lp.entry) : (S.store?.plugins ?? []);
    for (const c of CATEGORIES) {
      const n = universe.filter(e => catOf(e) === c.id).length;
      if (!n) continue;
      statusBox.append(chip(c.label, prefs.cats.includes(c.id), () => toggleCat(c.id), n));
    }
    if (prefs.cats.length || prefs.tags.length) statusBox.append(h("button", { class: "btn ghost sm", onclick: clearFilters }, "Clear filters"));
    // Tags you filtered by, removable.
    if (prefs.tags.length) {
      tagBox.append(h("span", { class: "lab" }, "Tagged:"), ...prefs.tags.map(t => h("button", { class: "chip rm", "aria-pressed": "true", onclick: () => toggleTag(t), title: "Remove this tag filter" }, t, h("span", { class: "c" }, "×"))));
    } else {
      tagBox.append(h("span", { class: "lab" }, "Click a tag on any plugin to filter by it."));
    }
    banner.replaceChildren();
    list.replaceChildren();
    if (sub === "installed") renderInstalled(list, banner, words);
    else renderStore(list, words);
  };
  refresh();
  return refresh;
};
