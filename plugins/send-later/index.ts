// @name Send Later
// @version 1.0.0
// @description /later in 2h your message sends it in this channel later. Also "tomorrow 09:30", "18:00" or "2026-12-24 18:00". Cancel or resend pending messages in the plugin's settings. Messages only go out while Mecord is open.
// @tags commands, utility, scheduling
// @category tools
import { definePlugin, Commands, Toasts, Stores, h, type PluginCtx } from "@mecord/api";
import { messageActions, onFound, parseWhen, fmtWhen, uid, storageQueue } from "../_lib";

interface Job { id: string; channelId: string; content: string; due: number; held?: string }

const MAX_JOBS = 100;
/** A message that came due this recently while Mecord was closed still goes out when it starts. Older ones are held for review. */
const GRACE = 10 * 60 * 1000;
const TICK = 15000;

const q = storageQueue();
const chName = (id: string) => { const c = Stores.ChannelStore?.getChannel?.(id); return c?.name ? `#${c.name}` : "this DM"; };
const sortJobs = (list: Job[]) => list.sort((a, b) => a.due - b.due);
/** One storage read-modify-write, queued so the sender and the commands can't overwrite each other. */
const edit = (ctx: PluginCtx, fn: (list: Job[]) => Job[]) => q(async () => {
  const next = fn(await ctx.storage.get<Job[]>("jobs", []));
  await ctx.storage.set("jobs", next);
  return next;
});

export default definePlugin({
  name: "Send Later",
  start(ctx) {
    const started = Date.now();
    let MA: any = null;
    onFound(ctx, messageActions, m => { MA = m; }, "message actions");

    // Takes the messages that are due out of storage in one step, so nothing can be picked up twice.
    const takeDue = () => q(async () => {
      const list = await ctx.storage.get<Job[]>("jobs", []);
      const now = Date.now();
      const due = list.filter(j => !j.held && j.due <= now);
      if (due.length) await ctx.storage.set("jobs", list.filter(j => !due.includes(j)));
      return due;
    });

    let busy = false;
    const send = async () => {
      if (busy || !MA) return;
      busy = true;
      try {
        for (const j of await takeDue()) {
          try {
            await MA.sendMessage(j.channelId, { content: j.content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] });
            Toasts.show(`Sent your scheduled message to ${chName(j.channelId)}`, "success", { duration: 2000 });
          } catch (e) {
            const why = (e as Error)?.message ?? String(e);
            ctx.log.error("send later", e);
            await edit(ctx, list => [...list, { ...j, due: Date.now(), held: why }]);
            Toasts.show(`Scheduled message not sent: ${why}`, "error");
          }
        }
      } finally { busy = false; }
    };

    // Anything that came due long before this start is held instead of being sent late.
    edit(ctx, list => list.map(j => (!j.held && j.due < started - GRACE ? { ...j, held: "Mecord was closed when it was due" } : j)))
      .then(send)
      .catch(e => ctx.log.error("send later startup", e));
    const timer = setInterval(() => { send().catch(e => ctx.log.error("send later", e)); }, TICK);
    ctx.add(() => clearInterval(timer));

    ctx.add(Commands.register({
      name: "later",
      description: "Send a message in this channel at a later time",
      options: [
        { name: "when", description: "e.g. in 2h, tomorrow 09:30, 18:00, 2026-12-24 18:00", required: true },
        { name: "message", description: "What to send (up to 2000 characters)", required: true },
      ],
      async execute(a, { channel }) {
        const channelId: string | undefined = channel?.id ?? Stores.SelectedChannelStore?.getChannelId?.();
        const text = String(a.message ?? "").trim();
        if (!channelId) { Toasts.show("Open a channel first", "error"); return; }
        if (!text || text.length > 2000) { Toasts.show("The message must be 1 to 2000 characters", "error"); return; }
        const at = parseWhen(String(a.when ?? ""));
        if (at === null) { Toasts.show("Couldn't read that time. Try in 2h, tomorrow 09:30 or 18:00.", "error"); return; }
        if (at <= Date.now()) { Toasts.show("That time has already passed", "error"); return; }
        const state = { full: false };
        await edit(ctx, list => {
          if (list.length >= MAX_JOBS) { state.full = true; return list; }
          return sortJobs([...list, { id: uid(), channelId, content: text, due: at }]);
        });
        if (state.full) { Toasts.show(`${MAX_JOBS} messages are already scheduled. Cancel some in the plugin settings first.`, "error"); return; }
        Toasts.show(`Will send ${fmtWhen(at)} in ${chName(channelId)}`, "success", { duration: 2500 });
        // Nothing is returned, so Discord posts no message for the command itself.
      },
    }));
  },
  renderSettings(el, ctx) {
    const box = h("div");
    const draw = async () => {
      const list = await ctx.storage.get<Job[]>("jobs", []);
      const row = (j: Job) => h("div", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "4px 0", fontSize: "12.5px" } },
        h("div", { style: { flex: "1", minWidth: "0" } },
          h("div", null, h("b", null, `${fmtWhen(j.due)} · ${chName(j.channelId)}`), j.held ? h("span", { style: { color: "#f0b232", marginLeft: "6px" } }, `Not sent: ${j.held}`) : ""),
          h("div", { style: { opacity: ".8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, j.content)),
        j.held ? h("button", { class: "b", style: { cursor: "pointer" }, onclick: async () => { await edit(ctx, l => l.map(x => (x.id === j.id ? { ...x, due: Date.now(), held: undefined } : x))); draw(); } }, "Send now") : "",
        h("button", { class: "b d", style: { cursor: "pointer" }, onclick: async () => { await edit(ctx, l => l.filter(x => x.id !== j.id)); draw(); } }, j.held ? "Discard" : "Cancel"));
      box.replaceChildren(...(list.length ? list.map(row) : [h("div", { style: { opacity: ".7", fontSize: "12.5px" } }, "Nothing scheduled. Type /later in a channel to schedule a message.")]));
    };
    draw();
    el.append(box);
  },
});
