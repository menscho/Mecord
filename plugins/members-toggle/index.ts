// @name Members Toggle
// @version 1.0.0
// @description Press Ctrl+Alt+M to hide or show the member list for more chat space.
// @tags shortcuts, cosmetic
// @category layout
import { definePlugin, Styles, Toasts, Keybinds } from "@mecord/api";

export default definePlugin({
  name: "Members Toggle",
  start(ctx) {
    Styles.set("plugin-members-toggle", `html.mecord-no-members [class*="membersWrap"],html.mecord-no-members [class*="members_"]{display:none!important}`);
    ctx.add(Keybinds.register({
      id: "members-toggle.toggle", label: "Hide or show the member list", group: "Members Toggle", combo: "Ctrl+Alt+M",
      run: () => { const off = document.documentElement.classList.toggle("mecord-no-members"); Toasts.show(off ? "Member list hidden" : "Member list shown", "info", { duration: 1000 }); },
    }));
    ctx.add(() => { document.documentElement.classList.remove("mecord-no-members"); Styles.remove("plugin-members-toggle"); });
  },
});
