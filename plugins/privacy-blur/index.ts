// @name Privacy Blur
// @version 1.0.0
// @description Press Ctrl+Alt+B to blur usernames, avatars, server and DM names (screen sharing, screenshots). Press again to reveal.
// @tags privacy
// @category privacy
import { definePlugin, Styles, Toasts, Keybinds } from "@mecord/api";

export default definePlugin({
  name: "Privacy Blur",
  start(ctx) {
    Styles.set("plugin-privacy-blur", `html.mecord-privacy [class*="username"],html.mecord-privacy [class*="avatar_"],html.mecord-privacy [class*="nameTag"],html.mecord-privacy [class*="channelName"],
      html.mecord-privacy [class*="privateChannels"] [class*="name_"],html.mecord-privacy [data-list-item-id^="guildsnav___"] img,html.mecord-privacy [class*="memberInner"]{filter:blur(7px)!important}
      html.mecord-privacy [class*="privateChannels"] :hover,html.mecord-privacy [class*="member_"]:hover *{filter:none!important}`);
    ctx.add(Keybinds.register({
      id: "privacy-blur.toggle", label: "Blur names and avatars", group: "Privacy Blur", combo: "Ctrl+Alt+B",
      run: () => {
        const on = document.documentElement.classList.toggle("mecord-privacy");
        Toasts.show(on ? "Privacy blur on" : "Privacy blur off", "info", { duration: 1200 });
      },
    }));
    ctx.add(() => { document.documentElement.classList.remove("mecord-privacy"); Styles.remove("plugin-privacy-blur"); });
  },
});
