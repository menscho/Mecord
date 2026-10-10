// @name Chat Font Size
// @version 1.0.0
// @description Set the message text size independently of Discord's setting.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `[id^="message-content-"],[class*="markup"],[class*="messageContent"]{font-size:${s.size}px!important;line-height:${Math.round(s.size * 1.375)}px!important}`;

export default definePlugin({
  name: "Chat Font Size",
  settings: {
  size: {
    type: "number",
    default: 17,
    label: "Size (px)",
    min: 11,
    max: 32
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-chat-font-size", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-chat-font-size"));
  },
});
