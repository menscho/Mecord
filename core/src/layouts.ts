// Layouts (where things sit), tweaks (accent, roundness, density, text size) and the CSS they generate.
// Everything here is plain CSS keyed on html[data-mecord-layout], so switching layouts never touches the DOM.
// Selectors use Discord's stable class prefixes (sidebar_, membersWrap, messagesWrapper, ...) the same way the bundled plugins do.

export type LayoutId = "classic" | "focus" | "floating" | "compact" | "wide" | "minimal";
export type Density = "default" | "compact" | "roomy";
export interface Tweaks { accent: string; radius: number; density: Density; textSize: number }
export const DEFAULT_TWEAKS: Tweaks = { accent: "", radius: 12, density: "default", textSize: 0 };

/** What each layout keeps on screen, used for the little schematic previews. */
export interface Shape { rail: boolean; side: boolean; members: boolean; floating?: boolean; dense?: boolean; centred?: boolean; flat?: boolean }
export const LAYOUTS: { id: LayoutId; name: string; blurb: string; shape: Shape }[] = [
  { id: "classic", name: "Classic", blurb: "Discord's own arrangement. Only the colours change.", shape: { rail: true, side: true, members: true } },
  { id: "floating", name: "Floating", blurb: "Every panel is a rounded card floating over a darker backdrop.", shape: { rail: true, side: true, members: true, floating: true } },
  { id: "focus", name: "Focus", blurb: "Just the conversation, centred. Server, channel and member lists are hidden.", shape: { rail: false, side: false, members: false, centred: true } },
  { id: "wide", name: "Wide", blurb: "Messages use the full width and the member list is hidden.", shape: { rail: true, side: true, members: false } },
  { id: "compact", name: "Compact", blurb: "Tighter rows and smaller avatars, so more fits on screen.", shape: { rail: true, side: true, members: true, dense: true } },
  { id: "minimal", name: "Minimal", blurb: "Flat and borderless, with the server and member lists hidden.", shape: { rail: false, side: true, members: false, flat: true } },
];
export const layoutName = (id: string) => LAYOUTS.find(l => l.id === id)?.name ?? "Classic";

/** Discord's brand variables. Overriding them is what the Accent tweak does. */
export const BRAND_VARS = [
  "--brand-500", "--brand-360", "--brand-400", "--brand-560", "--brand-600", "--background-brand", "--text-brand",
  "--control-brand-foreground", "--control-brand-foreground-new", "--control-primary-background-default",
  "--control-primary-background-hover", "--control-primary-background-active", "--input-border-active",
];

const HIDE_RAIL = `[class*="guilds_"],nav[aria-label*="Servers"]`;
const HIDE_SIDE = `[class*="sidebar_"]`;
const HIDE_MEMBERS = `[class*="membersWrap"],[class*="members_"]`;
const COLUMN = `[class*="messagesWrapper"] ol,[class*="scrollerInner"]>ol`;

/** CSS for the chosen layout. `radius` only matters to the floating layout. */
export function layoutCss(id: LayoutId, radius: number): string {
  const at = `html[data-mecord-layout="${id}"]`;
  switch (id) {
    case "focus": return `
${at} ${HIDE_RAIL},${at} ${HIDE_SIDE},${at} ${HIDE_MEMBERS}{display:none!important}
${at} ${COLUMN}{max-width:880px!important;margin-inline:auto!important}`;
    case "wide": return `
${at} ${HIDE_MEMBERS}{display:none!important}
${at} ${COLUMN}{max-width:none!important}`;
    case "compact": return `
${at} [class*="message_"]{padding-top:2px!important;padding-bottom:2px!important}
${at} [class*="avatar_"]{--custom-avatar-size:30px}
${at} [class*="member_"]{height:32px!important;margin-top:0!important}
${at} [class*="channel_"]{min-height:28px}`;
    case "minimal": return `
${at} ${HIDE_RAIL},${at} ${HIDE_MEMBERS}{display:none!important}
${at} ${HIDE_SIDE}{background:transparent!important;border:0!important;box-shadow:none!important}
${at} [class*="message_"]{border:0!important;background:transparent!important;box-shadow:none!important;padding-top:6px!important;padding-bottom:6px!important}
${at} [class*="messagesWrapper"]{background:transparent!important}`;
    case "floating": return `
${at} body,${at} #app-mount{background:var(--background-base-lowest)!important}
${at} ${HIDE_RAIL},${at} ${HIDE_SIDE},${at} [class*="chat_"],${at} [class*="membersWrap"]{margin:8px!important;border-radius:${radius}px!important;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.28)}
${at} ${HIDE_RAIL},${at} ${HIDE_SIDE},${at} [class*="membersWrap"]{background:var(--background-base-low)!important}
${at} ${HIDE_RAIL}{background:var(--background-base-lower)!important}`;
    default: return "";
  }
}

/** Density, text size, roundness and accent. Applied on top of every layout. */
export function tweakCss(t: Tweaks): string {
  const parts: string[] = [];
  if (t.density === "compact") parts.push(`[class*="message_"]{padding-top:2px!important;padding-bottom:2px!important}`);
  if (t.density === "roomy") parts.push(`[class*="message_"]{padding-top:14px!important;padding-bottom:4px!important}`);
  if (t.textSize > 0) parts.push(`[id^="message-content-"],[class*="markup"],[class*="messageContent"]{font-size:${t.textSize}px!important;line-height:${Math.round(t.textSize * 1.4)}px!important}`);
  if (t.accent) {
    const decl = [...BRAND_VARS.map(v => `${v}:${t.accent}!important`), `--control-primary-text-default:${inkFor(t.accent)}!important`];
    parts.push(`html,html.theme-dark,html.theme-light,body,body.theme-dark,body.theme-light,.theme-dark,.theme-light{${decl.join(";")}}`);
  }
  return parts.join("\n");
}

/** Readable text colour for a given accent (Discord uses white or near-black on brand colours). */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0b0d12" : "#ffffff";
}
