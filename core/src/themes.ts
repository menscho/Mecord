// Themes (BetterDiscord-style headers), Quick CSS (always last), wallpaper layer.
import { call } from "./bridge";
import { config, saveConfig, ThemeEntry } from "./plugins";
import { Styles, h } from "./features";
import { paintLooks } from "./looks";

export function parseMeta(css: string): Record<string, string> {
  const m = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(css);
  const meta: Record<string, string> = {};
  if (!m) return meta;
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^\s*\*?\s*@(\w+)\s+(.*?)\s*$/.exec(line);
    if (mm) meta[mm[1]] = mm[2];
  }
  return meta;
}

let headObserver: MutationObserver | null = null;

export function applyAll() {
  // Built-in palettes, layouts and tweaks first, so user CSS themes and Quick CSS come after them.
  paintLooks();
  const live = new Set<string>();
  for (const t of config.themes) {
    if (!t.enabled || t.builtin || !t.css) continue;
    live.add("theme-" + t.id);
    Styles.set("theme-" + t.id, t.css);
  }
  for (const el of [...document.querySelectorAll("style[data-mecord^='theme-']")]) {
    const id = (el as HTMLElement).dataset.mecord!;
    if (!live.has(id)) Styles.remove(id);
  }
  Styles.set("quickcss", config.quickCss);
  Styles.keepLast("quickcss");
  applyWallpaper();
  if (!headObserver && document.head) {
    let pending = false;
    headObserver = new MutationObserver(() => {
      if (pending) return; pending = true;
      queueMicrotask(() => { pending = false; Styles.keepLast("quickcss"); });
    });
    headObserver.observe(document.head, { childList: true });
  }
}

export function setQuickCss(css: string) { config.quickCss = css; saveConfig(); Styles.set("quickcss", css); Styles.keepLast("quickcss"); }

export function updateTheme(t: ThemeEntry) {
  const i = config.themes.findIndex(x => x.id === t.id);
  if (i >= 0) config.themes[i] = { ...config.themes[i], ...t, enabled: config.themes[i].enabled };
  else config.themes.push(t);
  applyAll();
}

export function removeTheme(id: string) {
  config.themes = config.themes.filter(t => t.id !== id);
  applyAll();
}

// ---------- wallpaper ----------
let wpEl: HTMLElement | null = null;
let wpToken = 0;
/** The pause-when-unfocused listeners of the video on screen, so replacing the wallpaper doesn't leave old ones behind. */
let wpPause: (() => void) | null = null;

function dropWallpaperListeners() {
  if (!wpPause) return;
  document.removeEventListener("visibilitychange", wpPause);
  window.removeEventListener("focus", wpPause);
  window.removeEventListener("blur", wpPause);
  wpPause = null;
}

/** Only the look: opacity, blur and darkening. Changing these must not reload a video. */
function wallpaperCss(w: { kind: string; opacity: number; blur: number; dim: number }) {
  // Blurring a playing video re-filters every frame, which costs more than the video itself, so blur is for pictures only.
  const blur = w.kind === "video" ? "none" : `blur(${w.blur}px)`;
  return `
    #mecord-wallpaper{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:#000}
    #mecord-wallpaper>*{width:100%;height:100%;object-fit:cover;opacity:${w.opacity};filter:${blur}}
    #mecord-wallpaper::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,${w.dim})}
    html,body,#app-mount,#app-mount>div,[class*="appMount"],[class*="app_"],[class*="bg_"],[class*="content_"],[class*="base_"],[class*="chat_"],[class*="chatContent"],
    [class*="messagesWrapper"],[class*="scrollerBase"],[class*="sidebar_"],[class*="panels_"],[class*="container__"],[class*="membersWrap"],[class*="members_"],
    [class*="channelTextArea"],[class*="title_"],[class*="searchBar"]{background-color:transparent!important}
    [class*="sidebar_"],[class*="membersWrap"],[class*="members_"],[class*="guilds_"]{background-color:rgba(0,0,0,.25)!important}`;
}

export async function applyWallpaper() {
  const w = config.wallpaper;
  const token = ++wpToken;
  if (w.kind === "none" || !w.src) { dropWallpaperListeners(); wpEl?.remove(); wpEl = null; Styles.remove("wallpaper-css"); return; }
  let url = w.src;
  if (!/^(https?:|data:|blob:)/i.test(url)) {
    try { url = (await call<{ url: string }>("file.serve", { path: w.src })).url; } catch (e) { return; }
  }
  if (token !== wpToken) return;
  dropWallpaperListeners();
  wpEl?.remove();
  const media = w.kind === "video"
    ? h("video", { src: url, autoplay: true, loop: true, muted: true, playsInline: true })
    : h("img", { src: url });
  (media as any).muted = true;
  wpEl = h("div", { id: "mecord-wallpaper" }, media);
  document.body.prepend(wpEl);
  Styles.set("wallpaper-css", wallpaperCss(w));
  if (w.kind === "video") {
    // Save power: pause when the window is hidden or unfocused.
    const v = media as HTMLVideoElement;
    wpPause = () => (document.hidden || !document.hasFocus() ? v.pause() : v.play().catch(() => {}));
    document.addEventListener("visibilitychange", wpPause); window.addEventListener("focus", wpPause); window.addEventListener("blur", wpPause);
  }
}

/** Repaints the wallpaper after a slider moved. The picture or video stays as it is. */
export function restyleWallpaper() {
  if (!wpEl || config.wallpaper.kind === "none") return void applyWallpaper();
  Styles.set("wallpaper-css", wallpaperCss(config.wallpaper));
}
