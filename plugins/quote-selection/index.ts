// @name Quote Selection
// @version 1.0.0
// @description Select text in a message, right-click → Quote Selection to paste it as a blockquote into the chat box.
// @tags chat, context-menu
// @category chat
import { definePlugin, ContextMenu } from "@mecord/api";
import { pasteIntoChat } from "../_lib";

export default definePlugin({
  name: "Quote Selection",
  start(ctx) {
    ctx.add(ContextMenu.register(c => {
      const sel = c.selection.trim();
      if (!sel || !c.message) return;
      return [{ label: "Quote Selection", action: () => pasteIntoChat(sel.split(/\r?\n/).map(l => "> " + l).join("\n") + "\n") }];
    }));
  },
});
