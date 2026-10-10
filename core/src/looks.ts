// Looks: the active theme, layout and tweaks; applying them; profiles; automatic light/dark; and their shortcuts.
import { config, saveConfig, setEnabled, loaded, isEnabled, Profile, Wallpaper } from "./plugins";
import { BUILTIN_THEMES, BuiltinTheme, paletteCss } from "./builtin-themes";
import { layoutCss, tweakCss, LayoutId, DEFAULT_TWEAKS, Tweaks } from "./layouts";
import { Styles, Toasts } from "./features";
import { Keybinds } from "./keybinds";

/** Set by the UI so a change made from a shortcut or profile repaints the window too. */
let changedHook: () => void = () => {};
export const setLooksHook = (fn: () => void) => { changedHook = fn; };

export const builtinById = (id: string) => BUILTIN_THEMES.find(b => b.id === id);
export const activeThemeId = () => config.themes.find(t => t.builtin && t.enabled)?.id ?? "";
export const activeBuiltin = (): BuiltinTheme | undefined => builtinById(activeThemeId());
/** The layout in use: the user's override if set, else the theme's own, else Classic. */
export const effectiveLayout = (): LayoutId => (config.look.layout || activeBuiltin()?.layout || "classic") as LayoutId;

/** Paint the palette, layout and tweaks. Lives in one stylesheet, created before user themes so they still win. */
export function paintLooks() {
  const t = activeBuiltin();
  const layout = effectiveLayout();
  const tw = config.look.tweaks;
  document.documentElement.dataset.mecordLayout = layout;
  const css = [t ? paletteCss(t) : "", layoutCss(layout, tw.radius), tweakCss(tw)].filter(Boolean).join("\n");
  Styles.set("mecord-looks", css);
}

/** Switch on the plugins a theme asks for, and switch off the ones it asked for last time that it no longer needs. */
async function syncThemePlugins(wanted: string[]) {
  const look = config.look;
  for (const id of [...look.autoEnabled]) {
    if (wanted.includes(id)) continue;
    look.autoEnabled = look.autoEnabled.filter(x => x !== id);
    if (isEnabled(id)) await setEnabled(id, false);
  }
  for (const id of wanted) {
    const lp = loaded.get(id);
    if (!lp || isEnabled(id) || lp.entry.native) continue; // native plugins keep their own consent step
    await setEnabled(id, true);
    if (!look.autoEnabled.includes(id)) look.autoEnabled.push(id);
  }
}

/** Make `id` the active built-in theme (`""` = Discord's own look). */
export async function applyTheme(id: string) {
  for (const t of config.themes) if (t.builtin) t.enabled = false;
  if (id) {
    const ex = config.themes.find(t => t.id === id);
    const b = builtinById(id);
    if (ex) ex.enabled = true;
    else if (b) config.themes.push({ id, name: b.name, enabled: true, builtin: true });
  }
  await syncThemePlugins(builtinById(id)?.enables ?? []);
  paintLooks();
  saveConfig();
}

/** `""` returns to the theme's own layout. */
export function applyLayout(id: LayoutId | "") {
  config.look.layout = id;
  paintLooks();
  saveConfig();
}

export function setTweaks(patch: Partial<Tweaks>) {
  Object.assign(config.look.tweaks, patch);
  paintLooks();
  saveConfig();
}

export const resetTweaks = () => setTweaks({ ...DEFAULT_TWEAKS });

/** Everything a profile captures, taken from the live state. */
export function captureLook(name: string, id = ""): Profile {
  return {
    id: id || `p${Date.now().toString(36)}`,
    name,
    theme: activeThemeId(),
    layout: config.look.layout,
    tweaks: { ...config.look.tweaks },
    plugins: [...loaded.keys()].filter(isEnabled),
    wallpaper: { ...config.wallpaper },
  };
}

/** Apply a profile (or a snapshot taken with captureLook, which is how Undo works). */
export async function applyProfile(p: Profile) {
  await applyTheme(p.theme);
  config.look.layout = p.layout;
  config.look.tweaks = { ...DEFAULT_TWEAKS, ...p.tweaks };
  config.wallpaper = { ...(p.wallpaper as Wallpaper) };
  for (const [id, lp] of loaded) {
    const want = p.plugins.includes(id);
    if (want === isEnabled(id)) continue;
    if (want && lp.entry.native && config.consent[id] !== lp.entry.native.sha256) continue; // needs the host's consent dialog
    await setEnabled(id, want);
  }
  config.look.autoEnabled = config.look.autoEnabled.filter(id => isEnabled(id));
  paintLooks();
  saveConfig();
  changedHook();
}

// ---- automatic light and dark ----
let mq: MediaQueryList | null = null;
export async function applyAutoNow() {
  const a = config.look.auto;
  if (!a.enabled) return;
  const want = (mq?.matches ?? true) ? a.dark : a.light;
  if (want && want !== activeThemeId()) await applyTheme(want);
}
export function startAutoLook() {
  if (mq) return;
  try {
    mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => { if (config.look.auto.enabled) void applyAutoNow().then(() => changedHook()); });
  } catch { mq = null; }
}

// ---- shortcuts ----
export function registerLookKeybinds() {
  Keybinds.register({
    id: "mecord.profile-next", label: "Switch to the next profile", group: "Mecord", combo: "",
    run: () => {
      const ps = config.profiles;
      if (!ps.length) { Toasts.show("No profiles yet. Save one under Themes → Profiles.", "info"); return; }
      const cur = ps.findIndex(p => p.theme === activeThemeId() && p.layout === config.look.layout);
      const next = ps[(cur + 1) % ps.length];
      void applyProfile(next).then(() => Toasts.show(`Profile: ${next.name}`, "success", { duration: 1800 }));
    },
  });
  Keybinds.register({
    id: "mecord.layout-next", label: "Cycle through layouts", group: "Mecord", combo: "",
    run: () => {
      const order: (LayoutId | "")[] = ["", "classic", "floating", "focus", "wide", "compact", "minimal"];
      const i = order.indexOf(config.look.layout);
      const next = order[(i + 1) % order.length];
      applyLayout(next);
      changedHook();
      Toasts.show(`Layout: ${next ? next[0].toUpperCase() + next.slice(1) : "theme default"}`, "info", { duration: 1600 });
    },
  });
}
