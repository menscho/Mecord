// The Mecord window and toasts borrow their colours from whatever Discord is currently showing,
// so they match the active built-in theme, a user CSS theme, or Discord's own default.

const FALLBACK = {
  bg0: "#1e1f22", bg1: "#2b2d31", bg2: "#313338", surface: "#383a40", surface2: "#41434a",
  text: "#dbdee1", muted: "#949ba4", line: "#3f4147", accent: "#5865f2", accentInk: "#ffffff",
  font: `"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif`,
};
const SOURCES: [keyof typeof FALLBACK, string][] = [
  ["bg0", "--background-base-lowest"], ["bg1", "--background-base-lower"], ["bg2", "--background-base-low"],
  ["surface", "--background-surface-high"], ["surface2", "--background-surface-highest"],
  ["text", "--text-normal"], ["muted", "--text-muted"], ["line", "--border-subtle"],
  ["accent", "--brand-500"], ["accentInk", "--control-primary-text-default"],
];

export interface Discord { bg0: string; bg1: string; bg2: string; surface: string; surface2: string; text: string; muted: string; line: string; accent: string; accentInk: string; font: string }

/** Read Discord's live colours. Falls back to Discord's dark defaults when the variables are missing. */
export function readDiscord(): Discord {
  const el = document.body ?? document.documentElement;
  const cs = getComputedStyle(el);
  const out = { ...FALLBACK } as any;
  for (const [key, name] of SOURCES) {
    const v = cs.getPropertyValue(name).trim();
    if (v) out[key] = v;
  }
  const font = cs.fontFamily.trim();
  if (font) out.font = font;
  return out as Discord;
}

/** Paint the window's CSS variables onto `el` (the Mecord host or the toast host). */
export function paint(el: HTMLElement, radius: number) {
  const d = readDiscord();
  const set = (k: string, v: string) => el.style.setProperty(k, v);
  set("--deep", d.bg0); set("--rail", d.bg1); set("--panel", d.bg2); set("--raised", d.surface); set("--raised2", d.surface2);
  set("--line", d.line); set("--text", d.text); set("--muted", d.muted);
  set("--accent", d.accent); set("--accent-ink", d.accentInk); set("--font", d.font);
  set("--mecord-radius", `${radius}px`);
}
