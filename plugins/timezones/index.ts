// @name Timezones
// @version 1.0.1
// @description Remember a timezone per person (right-click a user → Set Timezone) and see their local time next to every message timestamp.
// @tags chat, utility
// @category tools
import { definePlugin, ContextMenu, Styles, Toasts, h, Commands } from "@mecord/api";
import { popup } from "../_lib";

let tz: Record<string, string> = {};

function fiberProps(el: Element, pick: (p: any) => any) {
  let fiber: any = null;
  for (let n: Element | null = el, i = 0; n && i < 8 && !fiber; n = n.parentElement, i++) for (const k of Object.keys(n)) if (k.startsWith("__reactFiber$")) { fiber = (n as any)[k]; break; }
  for (let i = 0; fiber && i < 60; fiber = fiber.return, i++) { const r = fiber.memoizedProps && pick(fiber.memoizedProps); if (r) return r; }
  return null;
}
const fmt = (zone: string, ts: number, withDate = false) => {
  try { return new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", ...(withDate ? { weekday: "short" } : {}) }).format(ts); } catch { return null; }
};

export default definePlugin({
  name: "Timezones",
  settings: { show: { type: "boolean", default: true, label: "Show local time next to message timestamps" } },
  async start(ctx) {
    tz = await ctx.storage.get<Record<string, string>>("tz", {});
    Styles.set("plugin-timezones", `.mecord-tz{margin-left:6px;font-size:.72rem;color:var(--text-muted,#949ba4);white-space:nowrap}`);
    ctx.add(() => { Styles.remove("plugin-timezones"); document.querySelectorAll(".mecord-tz").forEach(n => n.remove()); });
    const save = () => ctx.storage.set("tz", tz);

    const ask = (user: any) => {
      const zones: string[] = (Intl as any).supportedValuesOf?.("timeZone") ?? [];
      const input = h("input", { type: "text", list: "mecord-tz-list", value: tz[user.id] ?? "", placeholder: "e.g. Europe/Berlin", style: { width: "260px", padding: "6px", background: "#111214", color: "#fff", border: "1px solid #333", borderRadius: "4px" } });
      const err = h("div", { style: { color: "#f23f43", fontSize: "12px", minHeight: "16px", marginTop: "4px" } });
      const ok = h("button", { style: { marginTop: "8px", padding: "6px 12px", background: "#7c5cff", color: "#fff", border: "0", borderRadius: "4px", cursor: "pointer" }, onclick: () => {
        if (!fmt(input.value, Date.now())) { err.textContent = "Unknown timezone"; return; }
        tz[user.id] = input.value; save(); close(); redecorate();
      } }, "Save");
      const close = popup(`Timezone for ${user.globalName ?? user.username}`, h("div", null, input, h("datalist", { id: "mecord-tz-list" }, ...zones.map(z => h("option", { value: z }))), err, ok));
      setTimeout(() => input.focus(), 50);
    };

    ctx.add(ContextMenu.register(c => {
      const user = c.user ?? c.message?.author;
      if (!user?.id) return;
      const out = [{ label: tz[user.id] ? `Change Timezone (${tz[user.id]})` : "Set Timezone", action: () => ask(user) }];
      if (tz[user.id]) out.push({ label: "Clear Timezone", action: () => { delete tz[user.id]; save(); redecorate(); } } as any);
      return out;
    }));

    const decorate = (roots: Element[]) => {
      if (!ctx.settings.get("show")) return;
      for (const t of ctx.dom.within(roots, 'li[id^="chat-messages-"] time:not([data-mecord-tz])')) {
        (t as HTMLElement).dataset.mecordTz = "1";
        const m = fiberProps(t, p => (p.message?.author?.id ? p.message : null));
        const zone = m && tz[m.author.id];
        if (!zone) continue;
        const ts = new Date(m.timestamp).getTime();
        const s = fmt(zone, ts, true);
        if (s) t.after(h("span", { class: "mecord-tz", title: zone }, `🕒 ${s}`));
      }
    };
    // After a changed timezone or setting: clear what is shown and decorate the whole page again.
    const redecorate = () => {
      document.querySelectorAll(".mecord-tz").forEach(n => n.remove());
      document.querySelectorAll("time[data-mecord-tz]").forEach(t => delete (t as HTMLElement).dataset.mecordTz);
      decorate([document.body]);
    };
    ctx.dom.onBatch(decorate);
    ctx.add(ctx.settings.onChange(redecorate));
    decorate([document.body]);

    ctx.add(Commands.register({
      name: "localtime", description: "Send your current time with your timezone",
      execute() { return { content: `It's ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date())} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) for me.` }; },
    }));
    void Toasts;
  },
});
