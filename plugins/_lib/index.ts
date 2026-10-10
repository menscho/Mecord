// Helpers shared by official plugins (bundled into each plugin by the store build).
import { Webpack, Stores, h, Styles } from "@mecord/api";

export const textbox = (): HTMLElement | null =>
  document.querySelector('[role="textbox"][data-slate-editor="true"]') as HTMLElement | null;

/** Insert text (or attach a file) into the chat box the same way a paste would. */
export function pasteIntoChat(payload: string | File) {
  const box = textbox();
  if (!box) return false;
  box.focus();
  const dt = new DataTransfer();
  if (typeof payload === "string") dt.setData("text/plain", payload); else dt.items.add(payload);
  box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  return true;
}

export const messageActions = () => Webpack.findByProps("sendMessage", "jumpToMessage");

/** Run `cb` once `finder` returns something (Discord lazy-loads many modules after startup). Gives up after a minute or when the plugin stops. */
export function onFound<T>(ctx: { add(d: () => void): void; log: { warn(...a: any[]): void } }, finder: () => T | undefined, cb: (found: T) => void, what = "module") {
  let stopped = false;
  ctx.add(() => { stopped = true; });
  const t0 = Date.now();
  const tick = () => {
    if (stopped) return;
    const f = finder();
    if (f) { cb(f); return; }
    if (Date.now() - t0 > 60000) { ctx.log.warn(`${what} not found after 60s`); return; }
    setTimeout(tick, 400);
  };
  tick();
}
export const currentChannelId = (): string | undefined => Stores.SelectedChannelStore?.getChannelId?.();
export const currentChannel = () => { const id = currentChannelId(); return id ? Stores.ChannelStore?.getChannel?.(id) : undefined; };
export const messageLink = (m: { id: string; channel_id: string }) => {
  const ch = Stores.ChannelStore?.getChannel?.(m.channel_id);
  return `https://discord.com/channels/${ch?.guild_id ?? "@me"}/${m.channel_id}/${m.id}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Runs storage read-modify-write steps one after another, so a timer and a click can't overwrite each other's changes. */
export function storageQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Reads a time the way people type it: "in 10m", "in 2 hours", "today 18:00", "tomorrow 09:30",
 * "18:00" (next time it is), "2026-12-24 18:00". Returns epoch ms, or null if it isn't understood.
 * Times in the past are returned as they are; callers decide what to do with them.
 */
export function parseWhen(input: string, now = Date.now()): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  const hm = (hh: string, mm: string) => (Number(hh) < 24 && Number(mm) < 60 ? [Number(hh), Number(mm)] : null);
  let m = /^in (\d{1,6}) ?(mins?|minutes?|m|hours?|hrs?|h|days?|d|weeks?|w)$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) return null;
    const unit = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2][0] as "m" | "h" | "d" | "w"];
    return now + n * unit;
  }
  m = /^(today|tomorrow)(?: (\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) {
    const t = m[2] ? hm(m[2], m[3]) : [9, 0];
    if (!t) return null;
    const d = new Date(now);
    if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
    d.setHours(t[0], t[1], 0, 0);
    return d.getTime();
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const t = hm(m[1], m[2]);
    if (!t) return null;
    const d = new Date(now);
    d.setHours(t[0], t[1], 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    const t = hm(m[4], m[5]);
    if (!t) return null;
    const d = new Date(y, mo, day, t[0], t[1]);
    return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day ? d.getTime() : null;
  }
  return null;
}

/** "today 18:00", "tomorrow 09:30" or "Mon 24 Dec 18:00", in the local timezone. */
export function fmtWhen(at: number, now = Date.now()): string {
  const d = new Date(at), n = new Date(now);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === n.toDateString()) return `today ${time}`;
  if (d.toDateString() === new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** Wrap a method on an object; returns an undo function that only restores if nobody wrapped it after us. */
export function wrap<T extends object, K extends keyof T>(obj: T, key: K, make: (orig: any) => any): () => void {
  const orig = (obj as any)[key];
  const mine = make(orig);
  (obj as any)[key] = mine;
  return () => { if ((obj as any)[key] === mine) (obj as any)[key] = orig; };
}

/** Small read-only popup (used for translations, edit history, who-reacted lists). */
export function popup(title: string, body: string | Node, anchor?: { x: number; y: number }) {
  const host = h("div", { style: { position: "fixed", inset: "0", zIndex: "2147483200", background: anchor ? "transparent" : "#0008", display: "flex", alignItems: "center", justifyContent: "center" } });
  const close = () => host.remove();
  host.addEventListener("mousedown", e => { if (e.target === host) close(); });
  const box = h("div", { style: { background: "#1e1f22", color: "#dbdee1", borderRadius: "8px", padding: "14px 16px", maxWidth: "520px", maxHeight: "70vh", overflow: "auto", font: "14px/1.4 system-ui,sans-serif", boxShadow: "0 10px 40px #000a", whiteSpace: "pre-wrap", userSelect: "text" } },
    h("div", { style: { fontWeight: "700", marginBottom: "8px", color: "#fff", display: "flex", gap: "12px" } }, h("span", { style: { flex: "1" } }, title), h("span", { style: { cursor: "pointer", opacity: ".7" }, onclick: close }, "✕")), body);
  if (anchor) { host.style.alignItems = "flex-start"; host.style.justifyContent = "flex-start"; box.style.position = "absolute"; box.style.left = Math.min(anchor.x, innerWidth - 540) + "px"; box.style.top = Math.min(anchor.y, innerHeight - 200) + "px"; }
  host.append(box);
  document.documentElement.append(host);
  return close;
}

/** CSS-only plugin factory with an optional `settings` driven stylesheet. */
export const cssId = (id: string) => "plugin-" + id;
export { Styles };
