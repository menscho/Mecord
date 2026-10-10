// @name Show Message IDs
// @version 1.0.1
// @description Shows each message's ID next to its timestamp (click to copy). Useful for bots and debugging.
// @tags developer
// @category developer
import { definePlugin, Styles, Utils, Toasts, h } from "@mecord/api";

export default definePlugin({
  name: "Show Message IDs",
  start(ctx) {
    Styles.set("plugin-show-message-ids", `.mecord-mid{margin-left:6px;font:10px Consolas,monospace;color:#80848e;cursor:pointer}.mecord-mid:hover{color:#fff}`);
    // Every timestamp, the ones already shown and the ones that appear later.
    ctx.dom.watch('li[id^="chat-messages-"] time:not([data-mecord-mid])', t => {
      (t as HTMLElement).dataset.mecordMid = "1";
      const id = /-(\d+)$/.exec(t.closest("li")!.id)?.[1];
      if (id) t.after(h("span", { class: "mecord-mid", title: "Click to copy", onclick: () => Utils.copy(id).then(() => Toasts.show("ID copied", "success", { duration: 900 })) }, id));
    });
    ctx.add(() => { document.querySelectorAll(".mecord-mid").forEach(n => n.remove()); document.querySelectorAll("time[data-mecord-mid]").forEach(t => delete (t as HTMLElement).dataset.mecordMid); Styles.remove("plugin-show-message-ids"); });
  },
});
