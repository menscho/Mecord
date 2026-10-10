// @name No Spellcheck
// @version 1.0.1
// @description Turns off the red spellcheck underlines in the chat box.
// @tags chat, cosmetic
// @category typing
import { definePlugin, Styles } from "@mecord/api";

const BOX = '[role="textbox"][data-slate-editor="true"]';

export default definePlugin({
  name: "No Spellcheck",
  start(ctx) {
    const apply = (roots: Element[]) => { for (const e of ctx.dom.within(roots, BOX)) e.setAttribute("spellcheck", "false"); };
    ctx.dom.onBatch(apply);
    if (document.body) apply([document.body]);
    Styles.set("plugin-no-spellcheck", `[role="textbox"] *{text-decoration-line:none!important}`);
    ctx.add(() => { Styles.remove("plugin-no-spellcheck"); document.querySelectorAll(BOX).forEach(e => e.removeAttribute("spellcheck")); });
  },
});
