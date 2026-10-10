// @name Double Click Reply
// @version 1.0.0
// @description Double-click a message to reply to it.
// @tags chat, shortcuts
// @category chat
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Double Click Reply",
  start(ctx) {
    const onDbl = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('a,button,img,video,[role="button"],[class*="reaction"],[class*="embed"],pre,code,[role="textbox"]')) return;
      const li = t.closest('li[id^="chat-messages-"]') as HTMLElement | null;
      if (!li) return;
      // Hovering makes Discord render the message's action toolbar; then press its Reply button.
      li.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      setTimeout(() => {
        const btn = li.querySelector('[aria-label="Reply"]') as HTMLElement | null;
        btn?.click();
      }, 80);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("dblclick", onDbl, true);
    ctx.add(() => document.removeEventListener("dblclick", onDbl, true));
  },
});
