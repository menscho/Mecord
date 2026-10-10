// @name Text Snippets
// @version 1.0.0
// @description Save reusable messages in the plugin's settings (one "name = text" per line) and send them with /snip name.
// @tags commands, utility
// @category typing
import { definePlugin, Commands, Toasts, h } from "@mecord/api";

const parse = (raw: string) => {
  const m = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) { const i = line.indexOf("="); if (i > 0) m.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim().replace(/\\n/g, "\n")); }
  return m;
};

export default definePlugin({
  name: "Text Snippets",
  settings: { snippets: { type: "string", default: "shrug = ¯\\_(ツ)_/¯\nbrb = be right back!", label: "Snippets (raw)" } },
  start(ctx) {
    ctx.add(Commands.register({
      name: "snip", description: "Send a saved snippet",
      options: [{ name: "name", description: "Snippet name", required: true }],
      execute(a) {
        const t = parse(ctx.settings.get<string>("snippets")).get(String(a.name).trim().toLowerCase());
        if (t === undefined) { Toasts.show(`No snippet called "${a.name}"`, "warning"); return; }
        return { content: t };
      },
    }));
  },
  renderSettings(el, ctx) {
    const ta = h("textarea", { rows: 8, spellcheck: false, value: ctx.settings.get<string>("snippets"),
      style: { width: "100%", background: "#111214", color: "#dbdee1", border: "1px solid #2b2d31", borderRadius: "6px", padding: "8px", fontFamily: "Consolas,monospace" },
      onchange: () => ctx.settings.set("snippets", ta.value) });
    el.append(h("div", { style: { fontSize: "12px", color: "#b5bac1", marginBottom: "6px" } }, "One snippet per line: name = text. Use \\n for a line break."), ta);
  },
});
