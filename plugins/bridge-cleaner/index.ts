// @name Bridge Cleaner
// @version 1.0.1
// @description Tidies messages relayed by bridges, webhooks and bots. "[TG] Alice" shows as Alice with a small TG badge, and the BOT tag, role icons and repeated names on those messages can be hidden. Every part is optional in settings.
// @tags chat, cosmetic, bridges
// @category chat
import { definePlugin, Stores, Styles, h, type PluginCtx } from "@mecord/api";

const ORIGINS = "telegram=TG\nmatrix=MX\nslack=SL\nirc=IRC\nwhatsapp=WA\nsignal=SG\nguilded=GD\nrevolt=RV\nminecraft=MC\nreddit=RD\ntwitch=TW\ndiscord=DC";
const PREFIX = /^\s*[\[(<{]\s*([^\])>}]{1,24}?)\s*[\])>}]\s*/;
const SUFFIX = /\s*[\[(]\s*([^\])]{1,24}?)\s*[\])]\s*$/;

/** "name=badge" lines → lookup from both the name and the badge itself, lower-cased. */
export function parseOrigins(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase(), short = line.slice(i + 1).trim();
    if (!name || !short) continue;
    map.set(name, short);
    map.set(short.toLowerCase(), short);
  }
  return map;
}

/** "[TG] Alice" or "Alice (Telegram)" → { short: "TG", rest: "Alice" }. Only known bridge names count, so "[Mod] Bob" stays as it is. */
export function splitOrigin(name: string, origins: Map<string, string>): { short: string; rest: string } | null {
  const pre = PREFIX.exec(name);
  if (pre) {
    const short = origins.get(pre[1].trim().toLowerCase()), rest = name.slice(pre[0].length).trim();
    if (short && rest) return { short, rest };
  }
  const suf = SUFFIX.exec(name);
  if (suf) {
    const short = origins.get(suf[1].trim().toLowerCase()), rest = name.slice(0, suf.index).trim();
    if (short && rest) return { short, rest };
  }
  return null;
}

export default definePlugin({
  name: "Bridge Cleaner",
  settings: {
    shortOrigin: { type: "boolean", default: true, label: "Shorten bridge names to a badge", description: "[TG] Alice shows as Alice with a small TG badge. Known bridge names are listed below the options." },
    hideBotTag: { type: "boolean", default: true, label: "Hide the BOT / APP tag on bridged messages", description: "Applies to webhook and bot messages." },
    hideRoles: { type: "boolean", default: true, label: "Hide role icons on bridged messages" },
    hideRepeat: { type: "boolean", default: true, label: "Hide a repeated bridge name", description: "When the same bridge user posts again and Discord shows their name again." },
  },
  start(ctx) {
    let origins = parseOrigins(ctx.settings.get<string>("origins") ?? ORIGINS);
    // The original text node we changed, so the name can be put back. Discord may replace the node; then we leave it alone.
    const applied = new WeakMap<HTMLElement, { text: Text; orig: string; rest: string }>();
    const LI = /^chat-messages-(\d+)-(\d+)$/;
    const lookup = (li: HTMLElement): any => { const mm = LI.exec(li.id); return mm ? Stores.MessageStore?.getMessage?.(mm[1], mm[2]) : undefined; };
    const isRelay = (m: any) => !!m && !!(m.webhook_id || m.webhookId || m.author?.bot);

    const restoreEl = (el: HTMLElement) => {
      const c = applied.get(el);
      if (c && c.text.parentNode === el && c.text.data === c.rest) c.text.data = c.orig;
      applied.delete(el);
      delete el.dataset.mecordOrigin;
    };
    const shorten = (el: HTMLElement) => {
      const c = applied.get(el);
      if (c && c.text.parentNode === el && c.text.data === c.rest) return;
      restoreEl(el);
      const text = [...el.childNodes].find((n): n is Text => n.nodeType === Node.TEXT_NODE && !!(n as Text).data.trim());
      if (!text) return;
      const s = splitOrigin(text.data, origins);
      if (!s) return;
      applied.set(el, { text, orig: text.data, rest: s.rest });
      text.data = s.rest;
      el.dataset.mecordOrigin = s.short;
    };
    const clearLi = (li: HTMLElement) => {
      delete li.dataset.mecordBridge;
      delete li.dataset.mecordRepeat;
      li.querySelectorAll<HTMLElement>("[data-mecord-origin]").forEach(restoreEl);
    };
    const previousChat = (li: HTMLElement) => {
      let p = li.previousElementSibling as HTMLElement | null;
      while (p && !p.id.startsWith("chat-messages-")) p = p.previousElementSibling as HTMLElement | null;
      return p;
    };
    const nextChat = (li: HTMLElement) => {
      let n = li.nextElementSibling as HTMLElement | null;
      while (n && !n.id.startsWith("chat-messages-")) n = n.nextElementSibling as HTMLElement | null;
      return n;
    };

    // A repeated name depends on the row above it, so the row below a changed one is looked at as well.
    const scan = (roots: Element[]) => {
      const shortOn = ctx.settings.get<boolean>("shortOrigin");
      const rows = new Set<HTMLElement>();
      for (const li of ctx.dom.within(roots, 'li[id^="chat-messages-"]') as HTMLElement[]) {
        rows.add(li);
        const next = nextChat(li);
        if (next) rows.add(next);
      }
      for (const li of rows) {
        const m = lookup(li);
        if (!isRelay(m)) { clearLi(li); continue; }
        li.dataset.mecordBridge = "1";
        const header = li.querySelector<HTMLElement>('[class*="header_"]');
        const prev = previousChat(li);
        const pm = prev ? lookup(prev) : undefined;
        if (header && isRelay(pm) && pm.author?.id === m.author?.id) li.dataset.mecordRepeat = "1";
        else delete li.dataset.mecordRepeat;
        const name = header?.querySelector<HTMLElement>('[class*="username"]');
        if (!name) continue;
        if (shortOn) shorten(name); else restoreEl(name);
      }
    };

    const css = () => {
      const rules: string[] = [];
      if (ctx.settings.get<boolean>("hideBotTag")) rules.push(`li[data-mecord-bridge] [class*="botTag"]{display:none!important}`);
      if (ctx.settings.get<boolean>("hideRoles")) rules.push(`li[data-mecord-bridge] [class*="roleIcon"]{display:none!important}`);
      if (ctx.settings.get<boolean>("hideRepeat")) rules.push(`li[data-mecord-repeat] [class*="header_"] [class*="username"]{display:none!important}`);
      if (ctx.settings.get<boolean>("shortOrigin")) rules.push(`[data-mecord-origin]::after{content:attr(data-mecord-origin);margin-left:5px;padding:0 4px;border-radius:4px;background:#5865f2;color:#fff;font-size:10px;font-weight:700;line-height:14px;vertical-align:2px}`);
      return rules.join("\n");
    };
    const restoreAll = () => { document.querySelectorAll<HTMLElement>("[data-mecord-origin]").forEach(restoreEl); };
    const refresh = () => { Styles.set("plugin-bridge-cleaner", css()); scan([document.body]); };

    ctx.add(ctx.settings.onChange(k => {
      if (k === "origins") origins = parseOrigins(ctx.settings.get<string>("origins") ?? ORIGINS);
      restoreAll();
      refresh();
    }));

    // The shared page hub batches DOM changes, so a scan runs once per burst and covers only the rows that changed.
    ctx.dom.onBatch(scan);
    refresh();
    ctx.add(() => {
      restoreAll();
      document.querySelectorAll<HTMLElement>("[data-mecord-bridge],[data-mecord-repeat]").forEach(clearLi);
      Styles.remove("plugin-bridge-cleaner");
    });
  },
  renderSettings(el, ctx: PluginCtx) {
    const ta = h("textarea", { rows: 8, spellcheck: false, value: ctx.settings.get<string>("origins") ?? ORIGINS,
      style: { width: "100%", boxSizing: "border-box", background: "#111214", color: "#dbdee1", border: "1px solid #2b2d31", borderRadius: "6px", padding: "8px", fontFamily: "Consolas,monospace" },
      onchange: () => ctx.settings.set("origins", ta.value) });
    el.append(h("div", { style: { fontSize: "12px", color: "#b5bac1", margin: "10px 0 6px" } }, "Bridge names, one per line as name=badge. A name is shortened only when it appears in brackets at the start or end, e.g. [TG] Alice or Alice (Telegram)."), ta);
  },
});
