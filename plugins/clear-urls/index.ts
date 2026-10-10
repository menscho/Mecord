// @name Clear URLs
// @version 1.0.2
// @description Strips tracking parameters (utm_*, fbclid, gclid, …) from links you send and from links shown in chat.
// @tags privacy, utility
// @category privacy
import { definePlugin } from "@mecord/api";
import { messageActions, wrap, onFound } from "../_lib";

const GLOBAL = /^(utm_[a-z_]+|fbclid|gclid|gclsrc|dclid|msclkid|mc_eid|mc_cid|igshid|igsh|ref_src|ref_url|_hsenc|_hsmi|yclid|twclid|ttclid|scid|vero_id|wickedid|oly_enc_id|oly_anon_id|__s|mkt_tok|ocid|trk|trkinfo|spm|_ga|_gl)$/i;
const BY_HOST: [RegExp, RegExp][] = [
  [/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/, /^(si|feature|pp)$/i],
  [/(^|\.)(twitter\.com|x\.com)$/, /^(s|t)$/i],
  [/(^|\.)amazon\.[a-z.]+$/, /^(tag|ref|ref_|pf_rd_[a-z]+|pd_rd_[a-z]+|th|psc|linkcode|creative|camp)$/i],
];

export function cleanUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  if (!/^https?:$/.test(u.protocol)) return raw;
  const extra = BY_HOST.filter(([h]) => h.test(u.hostname)).map(([, p]) => p);
  let changed = false;
  for (const k of [...u.searchParams.keys()]) {
    if (GLOBAL.test(k) || extra.some(p => p.test(k))) { u.searchParams.delete(k); changed = true; }
  }
  return changed ? u.toString() : raw;
}
const URL_RX = /https?:\/\/[^\s<>"']+/g;
export const cleanText = (t: string) => t.replace(URL_RX, m => {
  // keep trailing punctuation outside the URL
  const trail = /[.,;:!?)\]]+$/.exec(m)?.[0] ?? "";
  return cleanUrl(trail ? m.slice(0, -trail.length) : m) + trail;
});

export default definePlugin({
  name: "Clear URLs",
  settings: {
    outgoing: { type: "boolean", default: true, label: "Clean links in messages I send" },
    rendered: { type: "boolean", default: true, label: "Clean link targets shown in chat" },
  },
  start(ctx) {
    onFound(ctx, messageActions, MA => {
      ctx.add(wrap(MA, "sendMessage", orig => function (this: any, channelId: string, msg: any, ...rest: any[]) {
        if (ctx.settings.get<boolean>("outgoing") && msg && typeof msg.content === "string") msg.content = cleanText(msg.content);
        return orig.call(this, channelId, msg, ...rest);
      }));
    }, "message actions");

    const scan = (roots: Element[]) => {
      if (!ctx.settings.get<boolean>("rendered")) return;
      for (const a of ctx.dom.within(roots, 'a[href^="http"]:not([data-mecord-clean])')) {
        const el = a as HTMLAnchorElement;
        el.dataset.mecordClean = "1";
        const c = cleanUrl(el.href);
        if (c !== el.href) el.href = c;
      }
    };
    ctx.dom.onBatch(scan);
    if (document.body) scan([document.body]);
  },
});
