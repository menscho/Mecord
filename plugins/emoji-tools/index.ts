// @name Emoji Tools
// @version 1.0.0
// @description Right-click a custom emoji to copy its image URL or ID.
// @tags developer, context-menu
// @category chat
import { definePlugin, ContextMenu, Utils, Toasts, type MenuItem } from "@mecord/api";

export default definePlugin({
  name: "Emoji Tools",
  start(ctx) {
    ctx.add(ContextMenu.register(c => {
      const img = c.target.closest("img") as HTMLImageElement | null;
      const m = img && /\/emojis\/(\d+)\.(\w+)/.exec(img.src);
      if (!m) return;
      const out: MenuItem[] = [
        { label: "Copy Emoji URL", action: () => Utils.copy(`https://cdn.discordapp.com/emojis/${m[1]}.${m[2]}?size=256`).then(() => Toasts.show("Emoji URL copied", "success", { duration: 1200 })) },
        { label: "Copy Emoji ID", action: () => Utils.copy(m[1]) },
      ];
      return out;
    }));
  },
});
