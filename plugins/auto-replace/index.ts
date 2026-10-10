// @name Auto Replace
// @version 1.0.1
// @description Replaces words or phrases in messages as you send them (e.g. "brb" → "be right back"). Rules are edited in the plugin's settings.
// @tags chat, utility
// @category typing
import { definePlugin, h } from "@mecord/api";
import { messageActions, wrap, onFound } from "../_lib";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function rules(raw: string): [RegExp, string][] {
  const out: [RegExp, string][] = [];
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=>");
    if (i <= 0) continue;
    const from = line.slice(0, i).trim(), to = line.slice(i + 2).trim();
    if (from) out.push([new RegExp(`(?<![\\w])${esc(from)}(?![\\w])`, "gi"), to]);
  }
  return out;
}

export default definePlugin({
  name: "Auto Replace",
  settings: { rules: { type: "string", default: "brb => be right back\nidk => I don't know", label: "Rules (raw)" } },
  start(ctx) {
    onFound(ctx, messageActions, MA => ctx.add(wrap(MA, "sendMessage", orig => function (this: any, channelId: string, msg: any, ...rest: any[]) {
      if (msg && typeof msg.content === "string" && !/^\s*```/.test(msg.content)) {
        // Don't touch code blocks, inline code or URLs.
        msg.content = msg.content.split(/(```[\s\S]*?```|`[^`]*`|https?:\/\/\S+)/g).map((part: string, i: number) =>
          i % 2 ? part : rules(ctx.settings.get<string>("rules")).reduce((s, [rx, to]) => s.replace(rx, to), part)).join("");
      }
      return orig.call(this, channelId, msg, ...rest);
    })), "message actions");
  },
  renderSettings(el, ctx) {
    const ta = h("textarea", { rows: 8, spellcheck: false, value: ctx.settings.get<string>("rules"),
      style: { width: "100%", background: "#111214", color: "#dbdee1", border: "1px solid #2b2d31", borderRadius: "6px", padding: "8px", fontFamily: "Consolas,monospace" },
      onchange: () => ctx.settings.set("rules", ta.value) });
    el.append(h("div", { style: { fontSize: "12px", color: "#b5bac1", marginBottom: "6px" } }, "One rule per line: from => to. Whole words only, case-insensitive. Code and links are left alone."), ta);
  },
});
