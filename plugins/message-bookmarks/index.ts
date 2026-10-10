// @name Message Bookmarks
// @version 1.0.0
// @description Right-click a message → Bookmark. Review, open or delete bookmarks from this plugin's settings. Stored on your PC only.
// @tags chat, utility
// @category chat
import { definePlugin, ContextMenu, Toasts, Utils, h } from "@mecord/api";
import { messageLink } from "../_lib";

interface Mark { id: string; link: string; author: string; text: string; at: number }

export default definePlugin({
  name: "Message Bookmarks",
  async start(ctx) {
    ctx.add(ContextMenu.register(c => {
      const m = c.message;
      if (!m) return;
      return [{ label: "Bookmark Message", action: async () => {
        const list = await ctx.storage.get<Mark[]>("marks", []);
        if (list.some(x => x.id === m.id)) { Toasts.show("Already bookmarked", "info"); return; }
        list.unshift({ id: m.id, link: messageLink(m), author: m.author?.username ?? "?", text: (m.content ?? "").slice(0, 200) || "(attachment)", at: Date.now() });
        await ctx.storage.set("marks", list.slice(0, 500));
        Toasts.show("Bookmarked", "success", { duration: 1300 });
      } }];
    }));
  },
  renderSettings(el, ctx) {
    const box = h("div");
    const draw = async () => {
      const list = await ctx.storage.get<Mark[]>("marks", []);
      box.replaceChildren(...(list.length ? list.map(m => h("div", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "4px 0", fontSize: "12.5px" } },
        h("div", { style: { flex: "1", minWidth: "0" } }, h("b", null, m.author + ": "), m.text),
        h("button", { class: "b", style: { cursor: "pointer" }, onclick: () => Utils.copy(m.link).then(() => Toasts.show("Link copied", "success", { duration: 1200 })) }, "Copy link"),
        h("button", { class: "b d", style: { cursor: "pointer" }, onclick: async () => { await ctx.storage.set("marks", list.filter(x => x.id !== m.id)); draw(); } }, "Delete"))) : [h("div", { style: { opacity: ".7", fontSize: "12.5px" } }, "No bookmarks yet.")]));
    };
    draw(); el.append(box);
  },
});
