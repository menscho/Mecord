// @name Channel Notes
// @version 1.0.0
// @description Private per-channel notes (stored on your PC only). Press Ctrl+Alt+N to open the notepad for the current channel.
// @tags utility
// @category tools
import { definePlugin, Styles, Stores, h, Keybinds } from "@mecord/api";

export default definePlugin({
  name: "Channel Notes",
  async start(ctx) {
    let notes = await ctx.storage.get<Record<string, string>>("notes", {});
    Styles.set("plugin-channel-notes", `.mecord-notes{position:fixed;right:16px;top:56px;width:300px;z-index:2147482700;background:#1e1f22;color:#dbdee1;border-radius:8px;box-shadow:0 8px 28px #000a;font:13px system-ui,sans-serif;overflow:hidden}
      .mecord-notes header{padding:8px 10px;background:#2b2d31;font-weight:600;display:flex;justify-content:space-between}.mecord-notes textarea{width:100%;height:180px;background:#111214;color:#dbdee1;border:0;padding:8px;box-sizing:border-box;resize:vertical;outline:0;font:13px system-ui,sans-serif}`);
    let panel: HTMLElement | null = null;
    const chId = () => Stores.SelectedChannelStore?.getChannelId?.() as string | undefined;
    const close = () => { panel?.remove(); panel = null; };
    const open = () => {
      const id = chId();
      if (!id) return;
      const name = Stores.ChannelStore?.getChannel?.(id)?.name ?? "Direct message";
      const ta = h("textarea", { placeholder: "Notes for this channel…", value: notes[id] ?? "", oninput: () => { if (ta.value) notes[id] = ta.value; else delete notes[id]; ctx.storage.set("notes", notes); } });
      panel = h("div", { class: "mecord-notes" }, h("header", null, `Notes · #${name}`, h("span", { style: { cursor: "pointer" }, onclick: close }, "✕")), ta);
      document.documentElement.append(panel);
      ta.focus();
    };
    ctx.add(Keybinds.register({
      id: "channel-notes.toggle", label: "Open the notes for this channel", group: "Channel Notes", combo: "Ctrl+Alt+N",
      run: () => { if (panel) close(); else open(); },
    }));
    ctx.add(() => { close(); Styles.remove("plugin-channel-notes"); });
  },
});
