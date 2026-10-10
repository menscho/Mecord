// @name Message Reminders
// @version 1.0.0
// @description Right-click a message → Remind me to come back to it. When it's due you get a Mecord notification with a Jump button. Reminders are stored on your PC only.
// @tags chat, utility, reminders
// @category tools
import { definePlugin, ContextMenu, Toasts, Utils, h, type PluginCtx } from "@mecord/api";
import { messageActions, onFound, messageLink, parseWhen, fmtWhen, uid, storageQueue } from "../_lib";

interface Reminder { id: string; messageId: string; channelId: string; link: string; author: string; excerpt: string; note: string; due: number }

const MAX = 200;
const QUICK = [
  { label: "in 10 minutes", value: "in 10m" },
  { label: "in 30 minutes", value: "in 30m" },
  { label: "in 1 hour", value: "in 1h" },
  { label: "in 2 hours", value: "in 2h" },
  { label: "tomorrow 09:00", value: "tomorrow 09:00" },
];
const LATE = 5 * 60 * 1000;

/** Message ids that have a pending reminder. Rebuilt from storage on start, so the context menu can read it synchronously. */
const pending = new Set<string>();
const q = storageQueue();
const excerpt = (m: any) => ((m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 120)) || "(attachment)";
const field = { width: "100%", boxSizing: "border-box", background: "#111214", color: "#dbdee1", border: "0", borderRadius: "4px", padding: "8px", marginBottom: "8px", font: "13px system-ui,sans-serif", outline: "none" };
const load = (ctx: PluginCtx) => ctx.storage.get<Reminder[]>("reminders", []);
const save = (ctx: PluginCtx, list: Reminder[]) => ctx.storage.set("reminders", [...list].sort((a, b) => a.due - b.due).slice(0, MAX));
/** One storage read-modify-write, queued so the timer and the menu can't overwrite each other. */
const edit = (ctx: PluginCtx, fn: (list: Reminder[]) => Reminder[]) => q(async () => {
  const next = fn(await load(ctx));
  await save(ctx, next);
  return next;
});

export default definePlugin({
  name: "Message Reminders",
  settings: {
    quick: { type: "select", default: "in 1h", label: "Quick reminder time", description: "Used by the \"Remind me …\" menu item", options: QUICK },
    system: { type: "boolean", default: true, label: "Also show a system notification", description: "Only when Discord already has permission to show notifications." },
  },
  start(ctx) {
    let MA: any = null;
    onFound(ctx, messageActions, m => { MA = m; }, "message actions");
    let dialog: HTMLElement | null = null;
    let busy = false;

    const jump = (r: Reminder) => {
      const li = document.getElementById(`chat-messages-${r.channelId}-${r.messageId}`);
      if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (MA?.jumpToMessage) { MA.jumpToMessage({ channelId: r.channelId, messageId: r.messageId, flash: true }); return; }
      Utils.copy(r.link).then(() => Toasts.show("Couldn't open the message, so its link was copied", "info", { duration: 2500 })).catch(() => {});
    };

    const fire = (r: Reminder) => {
      const late = Date.now() - r.due > LATE;
      const text = `${late ? `Reminder from ${fmtWhen(r.due)}` : "Reminder"} · ${r.author}: ${r.excerpt}${r.note ? ` — ${r.note}` : ""}`;
      Toasts.show(text, "info", { duration: 20000, action: { label: "Jump", run: () => jump(r) } });
      if (ctx.settings.get<boolean>("system") && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("Mecord reminder", { body: text }); } catch (e) { ctx.log.warn("notification", e); }
      }
    };

    /** Returns an error message to show, or "" when the reminder was saved. */
    const create = async (m: any, when: string, note: string): Promise<string> => {
      const at = parseWhen(when);
      if (at === null) return "Couldn't read that time. Try in 2h, tomorrow 09:30 or 18:00.";
      if (at <= Date.now()) return "That time has already passed.";
      const state = { full: false };
      await edit(ctx, list => {
        const rest = list.filter(r => r.messageId !== m.id);
        if (rest.length >= MAX) { state.full = true; return list; }
        rest.push({ id: uid(), messageId: m.id, channelId: m.channel_id, link: messageLink(m), author: m.author?.username ?? "?", excerpt: excerpt(m), note, due: at });
        return rest;
      });
      if (state.full) return `${MAX} reminders are already set. Delete some in the plugin settings first.`;
      pending.add(m.id);
      Toasts.show(`Reminder set for ${fmtWhen(at)}`, "success", { duration: 2000 });
      return "";
    };

    const remove = async (messageId: string) => {
      await edit(ctx, list => list.filter(r => r.messageId !== messageId));
      pending.delete(messageId);
      Toasts.show("Reminder removed", "info", { duration: 1500 });
    };

    const openDialog = (m: any) => {
      dialog?.remove();
      const when = h("input", { type: "text", value: "in 1h", placeholder: "in 10m, in 2h, tomorrow 09:30, 18:00", style: field });
      const note = h("input", { type: "text", maxLength: 200, placeholder: "Note (optional)", style: field });
      const err = h("div", { style: { color: "#f23f43", fontSize: "12px", minHeight: "16px", marginBottom: "6px" } });
      const close = () => { host.remove(); if (dialog === host) dialog = null; };
      const go = async () => {
        const problem = await create(m, when.value.trim(), note.value.trim());
        if (problem) err.textContent = problem; else close();
      };
      const host: HTMLElement = h("div", { style: { position: "fixed", inset: "0", zIndex: "2147483200", background: "#0008", display: "flex", alignItems: "center", justifyContent: "center" } },
        h("div", { style: { background: "#1e1f22", color: "#dbdee1", borderRadius: "8px", padding: "16px", width: "340px", font: "13px/1.4 system-ui,sans-serif", boxShadow: "0 10px 40px #000a" } },
          h("div", { style: { fontWeight: "700", color: "#fff", marginBottom: "6px" } }, "Remind me about this message"),
          h("div", { style: { opacity: ".7", fontSize: "12px", marginBottom: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, `${m.author?.username ?? "?"}: ${excerpt(m)}`),
          when, note, err,
          h("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px" } },
            h("button", { class: "b", style: { cursor: "pointer" }, onclick: close }, "Cancel"),
            h("button", { class: "b", style: { cursor: "pointer" }, onclick: go }, "Set reminder"))));
      // Keys typed here must not reach Discord's chat box or its shortcuts.
      host.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape") close();
        else if (e.key === "Enter") go();
      });
      for (const t of ["keyup", "keypress", "input"]) host.addEventListener(t, e => e.stopPropagation());
      host.addEventListener("mousedown", e => { if (e.target === host) close(); });
      document.documentElement.append(host);
      dialog = host;
      requestAnimationFrame(() => { when.focus(); when.select(); });
    };

    ctx.add(ContextMenu.register(c => {
      const m = c.message;
      if (!m?.id) return;
      const items: { label: string; action: () => void }[] = [];
      if (pending.has(m.id)) {
        items.push({ label: "Remove reminder", action: () => { remove(m.id).catch(e => ctx.log.error("remove reminder", e)); } });
      } else {
        const quick = QUICK.find(opt => opt.value === ctx.settings.get<string>("quick")) ?? QUICK[2];
        items.push({ label: `Remind me ${quick.label}`, action: () => { create(m, quick.value, "").then(problem => { if (problem) Toasts.show(problem, "error"); }).catch(e => ctx.log.error("reminder", e)); } });
      }
      items.push({ label: "Remind me at…", action: () => openDialog(m) });
      return items;
    }));

    // Takes out the reminders that are due in one queued step, then shows them. Late ones (e.g. after Mecord was closed) still fire.
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = Date.now();
        const due = await q(async () => {
          const list = await load(ctx);
          const d = list.filter(r => r.due <= now);
          if (d.length) await save(ctx, list.filter(r => r.due > now));
          return d;
        });
        for (const r of due) { pending.delete(r.messageId); fire(r); }
      } finally { busy = false; }
    };
    load(ctx).then(list => { for (const r of list) pending.add(r.messageId); }).catch(e => ctx.log.error("reminders", e));
    const boot = setTimeout(() => { tick().catch(e => ctx.log.error("reminders", e)); }, 3000);
    const timer = setInterval(() => { tick().catch(e => ctx.log.error("reminders", e)); }, 10000);
    ctx.add(() => { clearTimeout(boot); clearInterval(timer); dialog?.remove(); dialog = null; });
  },
  renderSettings(el, ctx) {
    const box = h("div");
    const draw = async () => {
      const list = await load(ctx);
      const row = (r: Reminder) => h("div", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "4px 0", fontSize: "12.5px" } },
        h("div", { style: { flex: "1", minWidth: "0" } },
          h("div", null, h("b", null, `${fmtWhen(r.due)} · ${r.author}`)),
          h("div", { style: { opacity: ".8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.note ? `${r.note} — ${r.excerpt}` : r.excerpt)),
        h("button", { class: "b", style: { cursor: "pointer" }, onclick: () => { Utils.copy(r.link).then(() => Toasts.show("Link copied", "success", { duration: 1200 })).catch(() => {}); } }, "Copy link"),
        h("button", { class: "b d", style: { cursor: "pointer" }, onclick: async () => {
          await edit(ctx, l => l.filter(x => x.id !== r.id));
          pending.delete(r.messageId);
          draw();
        } }, "Delete"));
      box.replaceChildren(...(list.length ? list.map(row) : [h("div", { style: { opacity: ".7", fontSize: "12.5px" } }, "No reminders yet. Right-click a message to set one.")]));
    };
    draw();
    el.append(box);
  },
});
