// @name Copy Code Blocks
// @version 1.0.1
// @description Adds a Copy button to every code block in chat.
// @tags chat, utility
// @category chat
import { definePlugin, Styles, Utils, Toasts, h } from "@mecord/api";

export default definePlugin({
  name: "Copy Code Blocks",
  start(ctx) {
    Styles.set("plugin-copy-code-blocks", `pre{position:relative}.mecord-cc{position:absolute;top:6px;right:6px;background:#2b2d31;color:#dbdee1;border:0;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;opacity:0;transition:.12s}pre:hover .mecord-cc{opacity:.9}.mecord-cc:hover{background:#7c5cff;color:#fff}`);
    ctx.dom.watch('[id^="message-content-"] pre:not([data-mecord-cc])', el => {
      const pre = el as HTMLElement;
      pre.dataset.mecordCc = "1";
      const btn = h("button", { class: "mecord-cc", onclick: (e: Event) => { e.stopPropagation(); Utils.copy((pre.querySelector("code") ?? pre).textContent ?? "").then(() => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1200); }, () => Toasts.show("Copy failed", "error")); } }, "Copy");
      pre.append(btn);
    });
    ctx.add(() => { Styles.remove("plugin-copy-code-blocks"); document.querySelectorAll(".mecord-cc").forEach(n => n.remove()); document.querySelectorAll("[data-mecord-cc]").forEach(n => delete (n as HTMLElement).dataset.mecordCc); });
  },
});
