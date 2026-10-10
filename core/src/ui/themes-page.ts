// Themes page: the theme gallery (with a Try mode), layouts, tweaks, light/dark switching, profiles and your own CSS.
import { call } from "../bridge";
import { h, Toasts } from "../features";
import { config, saveConfig, Profile } from "../plugins";
import { BUILTIN_THEMES, Palette } from "../builtin-themes";
import { LAYOUTS, LayoutId, Shape, layoutName, Density } from "../layouts";
import { applyTheme, applyLayout, setTweaks, resetTweaks, activeThemeId, effectiveLayout, captureLook, applyProfile, applyAutoNow, activeBuiltin } from "../looks";
import { applyAll, updateTheme, removeTheme, parseMeta } from "../themes";
import { S, hooks, Mount, sw, seg, btn, pill, modal, openFolder } from "./shell";
import { loadStore } from "./plugins-page";

const DISCORD_DEFAULT: Palette = { b0: "#1e1f22", b1: "#2b2d31", b2: "#313338", s1: "#383a40", s2: "#41434a", s3: "#4a4d55", text: "#f2f3f5", muted: "#a0a4ad", accent: "#5865f2", accentText: "#fff", line: "#3f4147" };
const SHAPE_OF = (id: string): Shape => LAYOUTS.find(l => l.id === id)?.shape ?? LAYOUTS[0].shape;

/** A little schematic of the arrangement, drawn in the palette's colours. */
function preview(p: Palette, shape: Shape) {
  const bars = (n: number) => [...Array(n)].map((_, i) => h("u", { style: { width: `${[55, 82, 38, 70, 46][i % 5]}%`, background: i % 2 ? p.muted : p.text, opacity: i % 2 ? ".5" : ".85" } }));
  const el = h("div", { class: "pv" + (shape.floating ? " floating" : "") + (shape.dense ? " dense" : "") + (shape.centred ? " centred" : ""), style: { background: shape.floating ? p.b0 : p.b2 } });
  if (shape.rail) el.append(h("div", { class: "rail2", style: { background: p.b0, width: "18%" } }, ...[0, 1, 2, 3].map(i => h("u", { style: { background: i === 0 ? p.accent : p.s2 } }))));
  if (shape.side) el.append(h("div", { style: { background: shape.flat ? "transparent" : p.b1, width: "26%" } }, ...[70, 52, 62, 44].map(w => h("u", { style: { width: w + "%", background: p.s2 } }))));
  el.append(h("div", { class: "chat", style: { background: p.b2, borderRadius: shape.floating ? "7px" : "0" } }, ...bars(shape.dense ? 6 : 4), h("div", { class: "bar", style: { background: p.s1, border: shape.flat ? "0" : `1px solid ${p.line}` } })));
  if (shape.members) el.append(h("div", { style: { background: p.b1, width: "16%" } }, ...[0, 1, 2, 3].map(() => h("u", { style: { width: "70%", background: p.s2 } }))));
  el.setAttribute("aria-hidden", "true");
  return el;
}

function themeTile(id: string, name: string, blurb: string, p: Palette, layout: string, mode: string) {
  const active = activeThemeId() === id;
  const tile = h("div", {
    class: "tile", role: "button", tabindex: "0", "aria-pressed": String(active), "aria-label": `Use ${name}`,
    onclick: () => pickTheme(id),
    onkeydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickTheme(id); } },
  },
    h("button", { class: "try", title: "Try it for 20 seconds", onclick: (e: Event) => { e.stopPropagation(); startTrial(id); } }, "Try"),
    preview(p, SHAPE_OF(layout)),
    h("div", { class: "meta" },
      h("b", { class: "display" }, name, active && pill("Active", "acc"), mode === "light" && pill("Light")),
      h("small", null, blurb),
      h("div", { style: { marginTop: "6px" } }, pill(layoutName(layout)))));
  return tile;
}

async function pickTheme(id: string) {
  const prev = { theme: activeThemeId(), layout: config.look.layout };
  const name = id ? BUILTIN_THEMES.find(b => b.id === id)?.name ?? "theme" : "Discord default";
  await applyTheme(id);
  applyAll();
  hooks.refresh();
  Toasts.show(`Applied ${name}`, "success", {
    duration: 7000,
    action: { label: "Undo", run: async () => { await applyTheme(prev.theme); applyLayout(prev.layout); applyAll(); hooks.refresh(); } },
  });
}

// ---- try mode: apply a theme for 20 seconds, then go back unless the user keeps it ----
function startTrial(id: string) {
  if (S.trial) endTrial(false);
  const prevTheme = activeThemeId(), prevLayout = config.look.layout;
  S.trial = { id, prevTheme, prevLayout, until: Date.now() + 20000 };
  const t = S.trial;
  void applyTheme(id).then(() => { applyAll(); hooks.refresh(); });
  t.timer = setInterval(() => {
    if (S.trial !== t) { clearInterval(t.timer); return; }
    if (Date.now() >= t.until) endTrial(false);
    else if (t.label) t.label.textContent = String(Math.ceil((t.until - Date.now()) / 1000));
  }, 500);
  hooks.refresh();
}
function endTrial(keep: boolean) {
  const t = S.trial;
  if (!t) return;
  clearInterval(t.timer);
  S.trial = null;
  if (!keep) {
    void applyTheme(t.prevTheme).then(() => { applyLayout(t.prevLayout as LayoutId | ""); applyAll(); hooks.refresh(); });
  }
  hooks.refresh();
  if (keep) Toasts.show("Kept the new look", "success", { duration: 2400 });
}
function trialBanner() {
  const t = S.trial;
  if (!t) return null;
  const name = BUILTIN_THEMES.find(b => b.id === t.id)?.name ?? "Discord default";
  const label = h("b", { class: "display" }, String(Math.max(0, Math.ceil((t.until - Date.now()) / 1000))));
  t.label = label;
  return h("div", { class: "note warn" }, h("div", { class: "grow" }, "Trying ", h("b", null, name), ". It goes back in ", label, " s unless you keep it."),
    btn("Keep it", () => endTrial(true), "primary"), btn("Go back now", () => endTrial(false), "ghost"));
}

// ---- sub pages ----
function buildThemes(body: HTMLElement) {
  const act = activeBuiltin();
  body.append(h("div", { class: "note" }, h("div", { class: "grow" }, "Now: ", h("b", null, act?.name ?? "Discord default"), `  ·  ${layoutName(effectiveLayout())} layout${config.look.layout ? " (set by you)" : ""}`)));
  const tb = trialBanner();
  if (tb) body.append(tb);
  body.append(h("div", { class: "gallery" },
    themeTile("", "Discord default", "Discord's own colours and layout, untouched.", DISCORD_DEFAULT, "classic", "dark"),
    ...BUILTIN_THEMES.map(t => themeTile(t.id, t.name, t.blurb, t.p, t.layout, t.mode))));
  const store = (S.store?.themes ?? []) as any[];
  if (store.length) {
    body.append(h("div", { class: "section" }, h("h2", null, "More themes from the store"), h("span", null, "Signed, like plugins. Installed themes are switched on straight away.")));
    for (const t of store) {
      const local = config.themes.find(x => x.id === t.id);
      body.append(h("div", { class: "row nosw" },
        h("div", { class: "main" }, h("div", { class: "t" }, h("b", null, t.name), pill("v" + t.version), pill("Signed", "ok"), local?.enabled && pill("Active", "acc")),
          h("div", { class: "d" }, t.description ?? "")),
        h("div", { class: "a" }, btn(local ? "Reinstall" : "Install", async e => {
          (e.currentTarget as HTMLButtonElement).setAttribute("disabled", "");
          try {
            await call("store.install", { id: t.id, kind: "theme" });
            setTimeout(() => {
              const c = config.themes.find(x => x.id === t.id);
              if (c) { c.enabled = true; saveConfig(); applyAll(); }
              hooks.refresh();
            }, 900);
            Toasts.show(`Installed ${t.name}`, "success");
          } catch (er: any) { Toasts.show("Install failed: " + er.message, "error", { duration: 7000 }); }
          setTimeout(() => loadStore(true), 400);
        }, local ? "ghost" : "primary"),
        local?.origin === "store" && btn("Remove", async () => {
          try {
            await call("store.uninstall", { id: t.id, kind: "theme" });
            removeTheme(t.id); saveConfig(); hooks.refresh();
            Toasts.show(`Removed ${t.name}`);
          } catch (er: any) { Toasts.show(er.message, "error"); }
        }, "ghost"))));
    }
  }
}

function buildLayouts(body: HTMLElement) {
  const pal = activeBuiltin()?.p ?? DISCORD_DEFAULT;
  const theme = activeBuiltin();
  body.append(h("div", { class: "note" }, h("div", { class: "grow" },
    "Layouts decide where things sit. Each theme comes with one; pick a layout here to use it with any theme. Mecord's tweaks apply on top of every layout.")));
  const tile = (id: LayoutId | "", name: string, blurb: string, shapeId: LayoutId) => h("div", {
    class: "tile", role: "button", tabindex: "0", "aria-pressed": String(config.look.layout === id), "aria-label": `Use the ${name} layout`,
    onclick: () => { applyLayout(id); hooks.refresh(); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyLayout(id); hooks.refresh(); } },
  }, preview(pal, SHAPE_OF(shapeId)), h("div", { class: "meta" },
    h("b", { class: "display" }, name, config.look.layout === id && pill("Active", "acc")), h("small", null, blurb)));
  body.append(h("div", { class: "gallery" },
    tile("", "Theme's own", theme ? `Used by ${theme.name}: ${layoutName(theme.layout)}.` : "Each theme picks its own layout.", theme?.layout ?? "classic"),
    ...LAYOUTS.map(l => tile(l.id, l.name, l.blurb, l.id))));
}

function buildCustomize(body: HTMLElement) {
  const t = config.look.tweaks;
  const accentIn = h("input", { type: "color", value: t.accent || "#5865f2", "aria-label": "Accent colour" }) as HTMLInputElement;
  accentIn.addEventListener("input", () => setTweaks({ accent: accentIn.value }));
  const range = (label: string, min: number, max: number, step: number, val: number, fmt: (n: number) => string, on: (n: number) => void) => {
    const out = h("output", null, fmt(val));
    const i = h("input", { type: "range", min, max, step, value: String(val), "aria-label": label }) as HTMLInputElement;
    i.addEventListener("input", () => { out.textContent = fmt(Number(i.value)); on(Number(i.value)); });
    return h("div", { class: "range" }, h("label", null, label), i, out);
  };
  const density = h("select", { "aria-label": "Message density" },
    ...([["default", "Default"], ["compact", "Compact"], ["roomy", "Roomy"]] as [Density, string][]).map(([v, l]) => h("option", { value: v, selected: t.density === v }, l)));
  density.addEventListener("change", () => setTweaks({ density: density.value as Density }));

  const a = config.look.auto;
  const themeOpts = (mode: "dark" | "light", cur: string) => {
    const s = h("select", { "aria-label": `${mode} theme` }, ...BUILTIN_THEMES.filter(b => b.mode === mode).map(b => h("option", { value: b.id, selected: b.id === cur }, b.name)));
    s.addEventListener("change", () => { a[mode] = s.value; saveConfig(); void applyAutoNow().then(() => { applyAll(); hooks.refresh(); }); });
    return s;
  };
  const autoSw = sw(a.enabled, "Follow Windows light and dark", v => {
    a.enabled = v; saveConfig();
    void applyAutoNow().then(() => { applyAll(); hooks.refresh(); });
  });

  body.append(
    h("div", { class: "card" }, h("h3", { class: "display" }, "Colour"),
      h("p", null, "The accent colour shows on buttons, links and selections, everywhere Discord uses its brand colour, and in Mecord's window."),
      h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, accentIn,
        h("span", { class: "lab" }, t.accent ? t.accent.toUpperCase() : "Theme's own"),
        btn("Use the theme's own", () => { setTweaks({ accent: "" }); hooks.refresh(); }, "ghost"))),
    h("div", { class: "card" }, h("h3", { class: "display" }, "Shape and text"),
      h("p", null, "Roundness affects the floating layout and Mecord's window. Density and text size change how messages look."),
      range("Roundness", 0, 24, 1, t.radius, n => `${n}px`, n => setTweaks({ radius: n })),
      h("div", { class: "field" }, h("label", null, "Message density"), density),
      range("Message text", 0, 24, 1, t.textSize, n => (n ? `${n}px` : "Discord's"), n => setTweaks({ textSize: n }))),
    h("div", { class: "card" }, h("h3", { class: "display" }, "Light and dark"),
      h("p", null, "When this is on, Mecord switches theme whenever Windows changes between light and dark mode."),
      h("div", { style: { display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" } }, autoSw, h("span", null, "Follow Windows light and dark")),
      h("div", { class: "cols" },
        h("div", { class: "field" }, h("label", null, "Dark theme"), themeOpts("dark", a.dark)),
        h("div", { class: "field" }, h("label", null, "Light theme"), themeOpts("light", a.light)))),
    h("div", { style: { marginTop: "16px", display: "flex", gap: "8px" } },
      btn("Reset all tweaks", () => { resetTweaks(); applyAll(); hooks.refresh(); }, "ghost", "refresh")));
}

function buildProfiles(body: HTMLElement) {
  const name = h("input", { type: "text", placeholder: "Name, e.g. Work or Late night", "aria-label": "Profile name", style: { flex: "1" } }) as HTMLInputElement;
  const save = () => {
    const n = name.value.trim() || `Profile ${config.profiles.length + 1}`;
    config.profiles.push(captureLook(n));
    saveConfig(); name.value = "";
    Toasts.show(`Saved profile "${n}"`, "success");
    hooks.refresh();
  };
  name.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
  body.append(
    h("div", { class: "note" }, h("div", { class: "grow" },
      "A profile remembers the theme, layout, tweaks, which plugins are on, and the wallpaper. Applying one can be undone straight after.")),
    h("div", { class: "card" }, h("h3", { class: "display" }, "Save the current look"),
      h("div", { style: { display: "flex", gap: "8px" } }, name, btn("Save profile", save, "primary", "check"))));
  if (!config.profiles.length) { body.append(h("div", { class: "empty" }, h("b", null, "No profiles yet"), "Set things up the way you like, then save them here.")); return; }
  for (const p of config.profiles) {
    const theme = BUILTIN_THEMES.find(b => b.id === p.theme)?.name ?? (p.theme ? "Custom theme" : "Discord default");
    const enabledCount = p.plugins.length;
    body.append(h("div", { class: "row nosw" },
      h("div", { class: "main" }, h("div", { class: "t" }, h("b", null, p.name)),
        h("div", { class: "d" }, `${theme}  ·  ${layoutName(p.layout || (BUILTIN_THEMES.find(b => b.id === p.theme)?.layout ?? "classic"))} layout  ·  ${enabledCount} plugin${enabledCount === 1 ? "" : "s"} on`)),
      h("div", { class: "a" },
        btn("Apply", async () => {
          const snap: Profile = captureLook("Undo");
          await applyProfile(p);
          applyAll(); hooks.refresh();
          Toasts.show(`Applied ${p.name}`, "success", {
            duration: 8000,
            action: { label: "Undo", run: async () => { await applyProfile(snap); applyAll(); hooks.refresh(); } },
          });
        }, "primary", "play"),
        btn("Delete", async () => {
          if (!(await modal(`Delete "${p.name}"?`, [h("p", null, "The profile is removed. Your current look stays as it is.")], "Delete", true))) return;
          config.profiles = config.profiles.filter(x => x.id !== p.id); saveConfig(); hooks.refresh();
        }, "ghost"))));
  }
}

function buildCss(body: HTMLElement) {
  const url = h("input", { type: "text", placeholder: "https://example.com/theme.css", style: { flex: "1" }, "aria-label": "Theme address" }) as HTMLInputElement;
  const add = async () => {
    if (!url.value.trim()) return;
    try { const t = await call("theme.add", { url: url.value.trim() }); updateTheme({ ...t, enabled: true }); saveConfig(); url.value = ""; applyAll(); hooks.refresh(); Toasts.show("Theme added", "success"); }
    catch (e: any) { Toasts.show("Couldn't add the theme: " + e.message, "error", { duration: 7000 }); }
  };
  url.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
  body.append(h("div", { class: "note" }, h("div", { class: "grow" }, "CSS files and links. BetterDiscord theme headers (@name, @author…) are understood. Your Quick CSS always loads last.")),
    h("div", { style: { display: "flex", gap: "10px", marginTop: "12px" } }, url, btn("Add from link", add, "primary")));
  const mine = config.themes.filter(t => !t.builtin);
  if (!mine.length) body.append(h("div", { class: "empty", style: { padding: "26px 10px" } }, "Paste a link above, or drop a .css file into the themes folder. It shows up here and updates live when you save it."));
  for (const t of mine) {
    const meta = t.meta ?? parseMeta(t.css ?? "");
    const idx = config.themes.indexOf(t);
    body.append(h("div", { class: "row" },
      sw(t.enabled, `Use ${meta.name || t.name}`, v => { t.enabled = v; saveConfig(); applyAll(); }),
      h("div", { class: "main" }, h("div", { class: "t" }, h("b", null, meta.name || t.name), meta.version && pill("v" + meta.version), pill(t.url ? "Link · live" : "File"), t.error && pill("Error", "bad")),
        h("div", { class: "d" }, [meta.description, meta.author && "by " + meta.author, t.url ?? t.file].filter(Boolean).join(" · ")), t.error && h("div", { class: "err" }, t.error)),
      h("div", { class: "a" },
        idx > 0 && !config.themes[idx - 1].builtin && btn("Move up", () => { [config.themes[idx - 1], config.themes[idx]] = [config.themes[idx], config.themes[idx - 1]]; saveConfig(); applyAll(); hooks.refresh(); }, "ghost"),
        t.url && btn("Remove", async () => {
          if (!(await modal(`Remove ${meta.name || t.name}?`, [h("p", null, "The link is forgotten and the cached copy is deleted.")], "Remove", true))) return;
          await call("theme.remove", { id: t.id }); removeTheme(t.id); saveConfig(); hooks.refresh();
        }, "ghost"))));
  }
  body.append(h("div", { style: { marginTop: "14px" } }, btn("Open themes folder", () => openFolder("themes"), "ghost", "folder")));
}

export const mountThemes: Mount = (tools, head, body) => {
  head.append(btn("Themes folder", () => openFolder("themes"), "ghost", "folder"));
  tools.append(seg([["themes", "Themes"], ["layouts", "Layouts"], ["customize", "Customize"], ["profiles", "Profiles"], ["css", "Your CSS"]], S.sub.themes, id => {
    S.sub.themes = id; hooks.render();
  }));
  const build = () => {
    const sub = S.sub.themes;
    if (sub === "themes") buildThemes(body);
    else if (sub === "layouts") buildLayouts(body);
    else if (sub === "customize") buildCustomize(body);
    else if (sub === "profiles") buildProfiles(body);
    else buildCss(body);
  };
  build();
  if (S.sub.themes === "themes" && !S.store) void loadStore(false);
  return () => { body.replaceChildren(); build(); };
};
