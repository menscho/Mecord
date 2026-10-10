// @name Scroll To Bottom Key
// @version 1.0.0
// @description Press Ctrl+End to jump to the newest message in the current channel.
// @tags chat, shortcuts
// @category typing
import { definePlugin, Keybinds } from "@mecord/api";

export default definePlugin({
  name: "Scroll To Bottom Key",
  start(ctx) {
    ctx.add(Keybinds.register({
      id: "scroll-to-bottom.jump", label: "Jump to the newest message", group: "Scroll To Bottom Key", combo: "Ctrl+End",
      run: () => {
        const jump = document.querySelector('[class*="jumpToPresentBar"] button, button[class*="jumpToPresent"]') as HTMLElement | null;
        if (jump) jump.click();
        const sc = document.querySelector('[class*="messagesWrapper"] [class*="scroller"]') as HTMLElement | null;
        if (sc) sc.scrollTop = sc.scrollHeight;
      },
    }));
  },
});
