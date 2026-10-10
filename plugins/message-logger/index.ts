// @name Message Logger
// @version 1.1.0
// @description Keeps deleted messages visible (marked in red) and records the edit history of edited messages, for this session.
// @tags chat, privacy
// @category privacy
import { definePlugin, Flux, ContextMenu, Stores, Styles, Toasts, h, Commands } from "@mecord/api";
import { popup } from "../_lib";

const deleted = new Map<string, { channelId: string; content: string; author: string }>();
const edits = new Map<string, string[]>(); // message id -> previous contents (oldest first)

const CSS = `
li.mecord-deleted{background:rgba(242,63,67,.09)!important;box-shadow:inset 3px 0 0 #f23f43}
li.mecord-deleted [id^="message-content-"]{color:#f23f43cc!important}
li.mecord-deleted [id^="message-content-"]::after{content:" (deleted)";font-size:11px;opacity:.7}
.mecord-edited-badge{font-size:10px;color:#a0a4ac;margin-left:6px;cursor:pointer;user-select:none}
.mecord-edited-badge:hover{color:#fff;text-decoration:underline}`;

function msgIdFromEl(li: Element) {
  const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id);
  return m ? { channelId: m[1], id: m[2] } : null;
}

/** Stores `value` under `key`. Past `max` entries the oldest is forgotten, so a long session stays light. */
function remember<V>(map: Map<string, V>, key: string, value: V, max: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value as string);
}

export default definePlugin({
  name: "Message Logger",
  settings: {
    ignoreSelf: { type: "boolean", default: true, label: "Ignore my own deleted messages" },
    ignoreBots: { type: "boolean", default: false, label: "Ignore messages from bots" },
    history: { type: "boolean", default: true, label: "Track edit history" },
    max: { type: "number", default: 500, label: "Most messages to remember", description: "Older entries are forgotten first.", min: 50, max: 5000 },
  },
  start(ctx) {
    Styles.set("plugin-message-logger", CSS);
    ctx.add(() => { Styles.remove("plugin-message-logger"); });
    const me = () => Stores.UserStore?.getCurrentUser?.()?.id;
    const max = () => ctx.settings.get<number>("max");

    const shouldKeep = (m: any) => !!m && !(ctx.settings.get("ignoreSelf") && m.author?.id === me()) && !(ctx.settings.get("ignoreBots") && m.author?.bot);
    const record = (channelId: string, id: string) => {
      const m = Stores.MessageStore?.getMessage?.(channelId, id);
      if (!shouldKeep(m)) return false;
      remember(deleted, id, { channelId, content: m.content ?? "", author: m.author?.username ?? "?" }, max());
      return true;
    };

    // Set below, once the decorator exists. Flux handlers only run after start() has returned.
    let decorateSoon = () => {};
    ctx.add(Flux.intercept(e => {
      switch (e.type) {
        case "MESSAGE_DELETE": return record(e.channelId, e.id) ? (decorateSoon(), true) : false;
        case "MESSAGE_DELETE_BULK": {
          const keep = (e.ids as string[]).filter(id => record(e.channelId, id));
          if (keep.length === (e.ids as string[]).length) { decorateSoon(); return true; }
          return false;
        }
        case "MESSAGE_UPDATE": {
          if (!ctx.settings.get("history") || typeof e.message?.content !== "string") return false;
          const old = Stores.MessageStore?.getMessage?.(e.message.channel_id, e.message.id);
          if (old && old.content !== e.message.content) {
            remember(edits, old.id, [...(edits.get(old.id) ?? []), old.content].slice(-20), max());
            decorateSoon();
          }
          return false;
        }
      }
      return false;
    }));

    // DOM marking, re-applied as Discord re-renders the list. One pass over the rows on screen, so the cost doesn't
    // grow with the number of edited messages.
    let queued = false;
    const decorate = () => {
      queued = false;
      if (!deleted.size && !edits.size) return;
      for (const li of document.querySelectorAll<HTMLElement>('li[id^="chat-messages-"]')) {
        const info = msgIdFromEl(li);
        if (!info) continue;
        if (deleted.has(info.id) && !li.classList.contains("mecord-deleted")) li.classList.add("mecord-deleted");
        const hist = edits.get(info.id);
        if (!hist) continue;
        const content = li.querySelector(`[id="message-content-${info.id}"]`);
        if (content && !content.querySelector(".mecord-edited-badge")) {
          content.append(h("span", { class: "mecord-edited-badge", title: "Show edit history", onclick: () => showHistory(info.id) }, `✎ ${hist.length} earlier version${hist.length > 1 ? "s" : ""}`));
        }
      }
    };
    decorateSoon = () => { if (!queued) { queued = true; setTimeout(decorate, 0); } };
    ctx.dom.onBatch(() => decorateSoon());
    ctx.add(() => { document.querySelectorAll(".mecord-deleted").forEach(n => n.classList.remove("mecord-deleted")); document.querySelectorAll(".mecord-edited-badge").forEach(n => n.remove()); });

    const showHistory = (id: string) => {
      const cur = Stores.MessageStore?.getMessage?.(Stores.SelectedChannelStore?.getChannelId?.(), id)?.content ?? "";
      const hist = edits.get(id) ?? [];
      popup("Edit history", h("div", null, ...hist.map((t, i) => h("div", { style: { marginBottom: "8px", opacity: ".85" } }, h("div", { style: { fontSize: "11px", opacity: ".6" } }, `Version ${i + 1}`), t || "(empty)")),
        h("div", null, h("div", { style: { fontSize: "11px", opacity: ".6" } }, "Current"), cur)));
    };

    ctx.add(ContextMenu.register(c => {
      const m = c.message;
      if (!m) return;
      const out: { label: string; action: () => void }[] = [];
      if (edits.has(m.id)) out.push({ label: "View Edit History", action: () => showHistory(m.id) });
      if (deleted.has(m.id)) out.push({ label: "Remove from Log", action: () => { deleted.delete(m.id); document.getElementById(`chat-messages-${m.channel_id}-${m.id}`)?.classList.remove("mecord-deleted"); } });
      return out;
    }));
    ctx.add(Commands.register({
      name: "clear-message-log", description: "Forget all logged deleted messages and edit history",
      execute() { deleted.clear(); edits.clear(); decorateSoon(); Toasts.show("Message log cleared", "success", { duration: 1500 }); },
    }));
  },
  renderSettings(el) {
    const line = h("div", { style: { fontSize: "12.5px", color: "#b5bac1" } }, `Remembering ${deleted.size} deleted and ${edits.size} edited message(s) this session.`);
    el.append(line);
  },
  stop() { /* logs are kept in memory for the session */ },
});
