// Themes that ship inside Mecord. A theme is a colour palette, a default layout, and optionally plugins to switch on while it is active.
// The palette is applied by overriding Discord's own colour variables (names verified against Discord's "visual refresh" stylesheet),
// so no class-name selectors are involved in the colours.
import type { LayoutId } from "./layouts";

export interface Palette {
  b0: string; b1: string; b2: string;      // server rail, channel list, chat/base
  s1: string; s2: string; s3: string;      // raised surfaces
  text: string; muted: string; accent: string; accentText: string; line: string;
}
export interface BuiltinTheme {
  id: string; name: string; blurb: string;
  mode: "dark" | "light";
  layout: LayoutId;
  /** Plugins switched on while this theme is active, and off again when another theme is picked. */
  enables?: string[];
  p: Palette;
}

export const BUILTIN_THEMES: BuiltinTheme[] = [
  { id: "builtin-midnight-ink", name: "Midnight Ink", mode: "dark", layout: "classic", blurb: "Deep blue-black with a cool cornflower accent.",
    p: { b0: "#0b0d13", b1: "#10131b", b2: "#151925", s1: "#1a1f2e", s2: "#21273a", s3: "#293049", text: "#e7eaf3", muted: "#8b93ab", accent: "#7aa7ff", accentText: "#0b1020", line: "#252b3d" } },
  { id: "builtin-espresso", name: "Espresso", mode: "dark", layout: "compact", blurb: "Warm roasted browns and amber highlights, with tighter rows.",
    p: { b0: "#14100d", b1: "#1a1511", b2: "#211b16", s1: "#29221b", s2: "#322a22", s3: "#3b3228", text: "#f1e8dc", muted: "#a89a88", accent: "#e0a458", accentText: "#1f1507", line: "#372e25" } },
  { id: "builtin-glacier", name: "Glacier", mode: "dark", layout: "floating", blurb: "Steel blue-grey with an icy teal accent. Panels float as cards.",
    p: { b0: "#0e1419", b1: "#131b22", b2: "#19232c", s1: "#1f2b36", s2: "#263441", s3: "#2d3d4c", text: "#e6eef5", muted: "#8fa3b5", accent: "#5ec8d8", accentText: "#06161a", line: "#2a3946" } },
  { id: "builtin-rose-dusk", name: "Rosé Dusk", mode: "dark", layout: "wide", blurb: "Dusty plum and a soft rose accent. Full-width messages.",
    p: { b0: "#130e14", b1: "#19121b", b2: "#201722", s1: "#281d2b", s2: "#312434", s3: "#3a2b3e", text: "#f3e6ee", muted: "#ad94a5", accent: "#f08fb0", accentText: "#2a0b17", line: "#38293b" } },
  { id: "builtin-evergreen", name: "Evergreen", mode: "dark", layout: "focus", blurb: "Forest-floor greens. Just the conversation, centred.",
    p: { b0: "#0b130f", b1: "#101a15", b2: "#15211b", s1: "#1b2922", s2: "#22322a", s3: "#293c33", text: "#e4f0e8", muted: "#8aa596", accent: "#7bd88f", accentText: "#071a0d", line: "#243329" } },
  { id: "builtin-obsidian", name: "Obsidian", mode: "dark", layout: "minimal", blurb: "True black for OLED screens. Flat, and it turns off the clutter plugins.",
    enables: ["hide-banners", "no-nitro-upsells", "hide-gift-button"],
    p: { b0: "#000000", b1: "#080808", b2: "#0e0e0e", s1: "#151515", s2: "#1d1d1d", s3: "#262626", text: "#ededed", muted: "#8a8a8a", accent: "#e4e4e7", accentText: "#0a0a0a", line: "#242424" } },
  { id: "builtin-paper", name: "Paper", mode: "light", layout: "floating", blurb: "Light and quiet: off-white cards on soft grey, with an ink-blue accent.",
    p: { b0: "#dfe2e8", b1: "#eceef2", b2: "#f8f9fb", s1: "#ffffff", s2: "#eef0f4", s3: "#e2e6ec", text: "#1d2230", muted: "#5b6474", accent: "#3b6fe0", accentText: "#ffffff", line: "#d3d8e1" } },
  { id: "builtin-ember", name: "Ember", mode: "dark", layout: "focus", blurb: "Charcoal with a warm coral glow. Focus mode for long conversations.",
    p: { b0: "#120b0a", b1: "#1a100e", b2: "#21150f", s1: "#2a1b15", s2: "#33221b", s3: "#3d2a22", text: "#f6e9e4", muted: "#b08f84", accent: "#ff7a59", accentText: "#2a0d05", line: "#3a2720" } },
  { id: "builtin-lagoon", name: "Lagoon", mode: "dark", layout: "compact", blurb: "Deep teal and aqua. Compact rows for busy servers.",
    p: { b0: "#071417", b1: "#0b1c20", b2: "#102629", s1: "#153034", s2: "#1c3c41", s3: "#244950", text: "#e3f4f2", muted: "#8ab6b1", accent: "#3fd0c0", accentText: "#031614", line: "#1f3a3e" } },
];

/** Every Discord variable a palette overrides. Also used for Quick CSS autocomplete. */
export const PALETTE_VARS = [
  "--background-base-lowest", "--background-base-lower", "--background-base-low",
  "--background-surface-high", "--background-surface-higher", "--background-surface-highest",
  "--chat-background-default", "--chat-background", "--channel-background-default",
  "--channeltextarea-background", "--input-background-default", "--card-background-default",
  "--background-secondary-alt", "--background-code",
  "--text-default", "--text-strong", "--header-primary", "--text-normal", "--text-muted", "--chat-text-muted",
  "--text-subtle", "--header-secondary", "--border-subtle", "--border-normal", "--chat-border",
  "--background-brand", "--brand-500", "--brand-360", "--brand-400", "--brand-560", "--brand-600", "--text-brand",
  "--control-brand-foreground", "--control-brand-foreground-new", "--control-primary-background-default",
  "--control-primary-background-hover", "--control-primary-background-active", "--control-primary-text-default", "--input-border-active",
];

/** CSS that paints a built-in palette. Works for light and dark themes alike. */
export function paletteCss(t: BuiltinTheme): string {
  const p = t.p;
  const vars: [string, string][] = [
    ["--background-base-lowest", p.b0], ["--background-base-lower", p.b1], ["--background-base-low", p.b2],
    ["--background-surface-high", p.s1], ["--background-surface-higher", p.s2], ["--background-surface-highest", p.s3],
    ["--chat-background-default", p.b2], ["--chat-background", p.b2], ["--channel-background-default", p.b2],
    ["--channeltextarea-background", p.s1], ["--input-background-default", p.b1], ["--card-background-default", p.s1],
    ["--background-secondary-alt", p.b1], ["--background-code", p.b1],
    ["--text-default", p.text], ["--text-strong", p.text], ["--header-primary", p.text], ["--text-normal", p.text],
    ["--text-muted", p.muted], ["--chat-text-muted", p.muted], ["--text-subtle", p.muted], ["--header-secondary", p.muted],
    ["--border-subtle", p.line], ["--border-normal", p.line], ["--chat-border", p.line],
    ["--background-brand", p.accent], ["--brand-500", p.accent], ["--brand-360", p.accent], ["--brand-400", p.accent], ["--brand-560", p.accent], ["--brand-600", p.accent],
    ["--text-brand", p.accent], ["--control-brand-foreground", p.accent], ["--control-brand-foreground-new", p.accent],
    ["--control-primary-background-default", p.accent], ["--control-primary-background-hover", p.accent], ["--control-primary-background-active", p.accent],
    ["--control-primary-text-default", p.accentText], ["--input-border-active", p.accent],
  ];
  const decl = vars.map(([k, v]) => `${k}:${v}!important`).join(";");
  // The selector list covers both classes Discord may put on <html> or <body>, so the palette wins whichever it uses.
  const sel = "html,html.theme-dark,html.theme-light,body,body.theme-dark,body.theme-light,.theme-dark,.theme-light,.theme-darker,.theme-midnight";
  return `/* ${t.name} (Mecord built-in, ${t.mode}) */
${sel}{${decl};color-scheme:${t.mode}}
html body,html body #app-mount{background:${p.b0}!important}
::selection{background:${p.accent}55}
`;
}
