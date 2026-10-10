// @name Word Counter
// @version 1.0.1
// @description Shows characters and words of the message you're typing, turning red past Discord's 2000-character limit.
// @tags chat
// @category typing
import { definePlugin, Styles, h } from "@mecord/api";
import { textbox } from "../_lib";

export default definePlugin({
  name: "Word Counter",
  settings: { limit: { type: "number", default: 2000, label: "Character limit (4000 with Nitro)", min: 100, max: 4000 } },
  start(ctx) {
    Styles.set("plugin-word-counter", `.mecord-wc{position:fixed;z-index:2147482000;font:11px system-ui,sans-serif;color:#949ba4;background:#1e1f22cc;border-radius:4px;padding:1px 6px;pointer-events:none}.mecord-wc.over{color:#f23f43}`);
    const el = h("div", { class: "mecord-wc", style: { display: "none" } });
    document.documentElement.append(el);
    const hide = () => { el.style.display = "none"; };
    const update = () => {
      const box = textbox();
      const text = box ? (box.innerText || "").replace(/\n$/, "") : "";
      if (!box || !text) return hide();
      const r = box.getBoundingClientRect(), limit = ctx.settings.get<number>("limit");
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      el.textContent = `${text.length}/${limit} · ${words} word${words === 1 ? "" : "s"}`;
      el.classList.toggle("over", text.length > limit);
      el.style.display = "block"; el.style.left = Math.max(4, r.right - el.offsetWidth - 4) + "px"; el.style.top = r.top - el.offsetHeight - 2 + "px";
    };
    document.addEventListener("input", update, true);
    window.addEventListener("resize", update);
    // Sending clears the box without an input event, and a reply bar or attachment moves it. The batch hub reports both,
    // and it only has work to do while the counter is on screen.
    ctx.dom.onBatch(() => { if (el.style.display !== "none") update(); });
    ctx.add(() => { document.removeEventListener("input", update, true); window.removeEventListener("resize", update); el.remove(); Styles.remove("plugin-word-counter"); });
  },
});
