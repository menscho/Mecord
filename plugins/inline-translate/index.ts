// @name Inline Translate
// @version 1.0.0
// @description Translate any message right under it (right-click → Translate Inline), or translate text you type with /translate.
// @tags chat, translation
// @capabilities net:translate.googleapis.com
// @category chat
import { definePlugin, ContextMenu, Commands, Toasts, h, Styles, type PluginCtx } from "@mecord/api";

const LANGS: [string, string][] = [["en", "English"], ["de", "German"], ["fr", "French"], ["es", "Spanish"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["pl", "Polish"],
  ["tr", "Turkish"], ["ru", "Russian"], ["uk", "Ukrainian"], ["ja", "Japanese"], ["ko", "Korean"], ["zh-CN", "Chinese (Simplified)"], ["ar", "Arabic"], ["hi", "Hindi"], ["sv", "Swedish"]];

async function translate(ctx: PluginCtx, text: string, to: string) {
  const r = await ctx.net.fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`);
  if (r.status !== 200) throw new Error(`service returned ${r.status}`);
  const j = r.json();
  return { text: (j[0] as any[]).map(s => s[0]).join(""), from: String(j[2] ?? "?") };
}

export default definePlugin({
  name: "Inline Translate",
  settings: {
    to: { type: "select", default: "en", label: "Translate into", options: LANGS.map(([value, label]) => ({ value, label })) },
  },
  start(ctx) {
    Styles.set("plugin-inline-translate", `.mecord-translation{margin-top:4px;padding:4px 8px;border-left:3px solid #7c5cff;background:#7c5cff14;border-radius:0 4px 4px 0;font-size:.95em;color:var(--text-normal,#dbdee1)}
      .mecord-translation small{display:block;opacity:.6;font-size:10.5px;margin-top:2px;cursor:pointer}`);
    ctx.add(() => { Styles.remove("plugin-inline-translate"); document.querySelectorAll(".mecord-translation").forEach(n => n.remove()); });

    ctx.add(ContextMenu.register(c => {
      const m = c.message;
      if (!m?.content) return;
      return [{ label: "Translate Inline", action: async () => {
        const li = document.getElementById(`chat-messages-${m.channel_id}-${m.id}`);
        const content = li?.querySelector(`[id^="message-content-"]`);
        if (!content) return;
        if (content.parentElement?.querySelector(".mecord-translation")) { content.parentElement.querySelector(".mecord-translation")!.remove(); return; }
        const box = h("div", { class: "mecord-translation" }, "Translating…");
        content.after(box);
        try {
          const to = ctx.settings.get<string>("to");
          const r = await translate(ctx, m.content, to);
          box.replaceChildren(r.text, h("small", { onclick: () => box.remove() }, `translated from ${r.from} → ${to} · click to hide`));
        } catch (e: any) { box.textContent = "Translation failed: " + e.message; }
      } }];
    }));

    ctx.add(Commands.register({
      name: "translate", description: "Translate text and send it",
      options: [{ name: "text", description: "Text to translate", required: true }, { name: "to", description: "Target language code (default from settings)" }],
      async execute(args) {
        const r = await translate(ctx, String(args.text), String(args.to || ctx.settings.get("to")));
        return { content: r.text };
      },
    }));
    void Toasts;
  },
});
