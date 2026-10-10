// @name Zen Mode
// @version 1.0.0
// @description Press Ctrl+Alt+Z to hide the server list, channel list and member list: just the conversation.
// @tags shortcuts, cosmetic
// @category layout
import { definePlugin, Styles, Toasts, Keybinds } from "@mecord/api";

export default definePlugin({
  name: "Zen Mode",
  start(ctx) {
    Styles.set("plugin-zen-mode", `html.mecord-zen nav[aria-label*="Servers"],html.mecord-zen [class*="guilds_"],html.mecord-zen [class*="sidebar_"],html.mecord-zen [class*="membersWrap"],html.mecord-zen [class*="members_"]{display:none!important}`);
    ctx.add(Keybinds.register({
      id: "zen-mode.toggle", label: "Zen mode: hide the side panels", group: "Zen Mode", combo: "Ctrl+Alt+Z",
      run: () => { const on = document.documentElement.classList.toggle("mecord-zen"); Toasts.show(on ? "Zen mode on" : "Zen mode off", "info", { duration: 1000 }); },
    }));
    ctx.add(() => { document.documentElement.classList.remove("mecord-zen"); Styles.remove("plugin-zen-mode"); });
  },
});
