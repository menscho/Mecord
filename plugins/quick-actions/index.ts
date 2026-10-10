// @name Quick Actions
// @version 1.0.0
// @description Right-click helpers: copy message link/text/ID, copy image URL, reverse-image search, translate.
// @tags utility, context-menu
// @capabilities net:translate.googleapis.com
// @category tools
import { definePlugin, ContextMenu, Toasts, Utils, type MenuCtx, type MenuItem, type PluginCtx } from "@mecord/api";
import { messageLink, popup } from "../_lib";

const open = (url: string) => window.open(url, "_blank");

async function translate(ctx: PluginCtx, text: string, to: string) {
  const r = await ctx.net.fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`);
  if (r.status !== 200) throw new Error("translation service returned " + r.status);
  const j = r.json();
  return { text: (j[0] as any[]).map(s => s[0]).join(""), from: j[2] as string };
}

export default definePlugin({
  name: "Quick Actions",
  settings: {
    translateTo: { type: "string", default: "en", label: "Translate to (language code)", placeholder: "en" },
    search: { type: "select", default: "lens", label: "Reverse image search engine", options: [
      { label: "Google Lens", value: "lens" }, { label: "TinEye", value: "tineye" }, { label: "SauceNAO", value: "sauce" }, { label: "Yandex", value: "yandex" }] },
  },
  start(ctx) {
    const provider = (c: MenuCtx): MenuItem[] | void => {
      const items: MenuItem[] = [];
      if (c.message) {
        const m = c.message;
        items.push(
          { label: "Copy Message Link", action: () => Utils.copy(messageLink(m)).then(() => Toasts.show("Link copied", "success", { duration: 1200 })) },
          { label: "Copy Message ID", action: () => Utils.copy(m.id) },
        );
        if (m.content) {
          items.push({ label: "Copy Message Text", action: () => Utils.copy(m.content) });
          items.push({ label: "Translate", action: async () => {
            try { const r = await translate(ctx, m.content, ctx.settings.get<string>("translateTo") || "en"); popup(`Translation (${r.from} → ${ctx.settings.get("translateTo") || "en"})`, r.text); }
            catch (e: any) { Toasts.show("Translate failed: " + e.message, "error"); }
          } });
        }
      }
      const img = c.src ?? (c.target.closest("a")?.href && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(c.target.closest("a")!.href) ? c.target.closest("a")!.href : undefined);
      if (img) {
        items.push({ label: "Copy Image URL", action: () => Utils.copy(img) });
        const q = encodeURIComponent(img);
        const eng: Record<string, string> = {
          lens: `https://lens.google.com/uploadbyurl?url=${q}`, tineye: `https://tineye.com/search?url=${q}`,
          sauce: `https://saucenao.com/search.php?url=${q}`, yandex: `https://yandex.com/images/search?rpt=imageview&url=${q}`,
        };
        items.push({ label: "Reverse Image Search", action: () => open(eng[ctx.settings.get<string>("search")] ?? eng.lens) });
      }
      if (c.selection) {
        items.push({ label: "Translate Selection", action: async () => {
          try { const r = await translate(ctx, c.selection, ctx.settings.get<string>("translateTo") || "en"); popup("Translation", r.text); }
          catch (e: any) { Toasts.show("Translate failed: " + e.message, "error"); }
        } });
      }
      return items;
    };
    ctx.add(ContextMenu.register(provider));
  },
});
