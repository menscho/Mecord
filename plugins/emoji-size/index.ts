// @name Emoji Size
// @version 1.0.0
// @description Make emoji bigger in chat.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `[id^="message-content-"] img[class*="emoji"]:not([class*="jumbo"]),[class*="markup"] img.emoji{width:${s.size}px!important;height:${s.size}px!important}`;

export default definePlugin({
  name: "Emoji Size",
  settings: {
  size: {
    type: "number",
    default: 28,
    label: "Emoji size (px)",
    min: 16,
    max: 96
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-emoji-size", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-emoji-size"));
  },
});
