// @name Full Timestamps
// @version 1.0.1
// @description Always shows the complete date and time on messages, instead of "Today at …".
// @tags chat, cosmetic
// @category chat
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Full Timestamps",
  settings: { seconds: { type: "boolean", default: false, label: "Include seconds" } },
  start(ctx) {
    // Built once per setting, not once per scan.
    let fm: Intl.DateTimeFormat | null = null, fmSeconds = false;
    const fmt = () => {
      const seconds = !!ctx.settings.get("seconds");
      if (!fm || fmSeconds !== seconds) { fm = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: seconds ? "medium" : "short" }); fmSeconds = seconds; }
      return fm;
    };
    const scan = (roots: Element[]) => {
      const f = fmt();
      for (const t of ctx.dom.within(roots, 'li[id^="chat-messages-"] time[datetime]')) {
        const el = t as HTMLElement;
        const want = f.format(new Date(el.getAttribute("datetime")!));
        if (el.dataset.mecordFull !== want) { if (!el.dataset.mecordOrig) el.dataset.mecordOrig = el.textContent ?? ""; el.textContent = want; el.dataset.mecordFull = want; }
      }
    };
    ctx.dom.onBatch(scan);
    if (document.body) scan([document.body]);
    ctx.add(ctx.settings.onChange(() => {
      document.querySelectorAll("time[data-mecord-full]").forEach(t => delete (t as HTMLElement).dataset.mecordFull);
      if (document.body) scan([document.body]);
    }));
    ctx.add(() => { for (const t of document.querySelectorAll("time[data-mecord-orig]")) { const el = t as HTMLElement; el.textContent = el.dataset.mecordOrig!; delete el.dataset.mecordOrig; delete el.dataset.mecordFull; } });
  },
});
