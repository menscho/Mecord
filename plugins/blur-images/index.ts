// @name Blur Images
// @version 1.0.0
// @description Blurs images and videos in chat until you hover them (handy at work or on stream).
// @tags privacy, cosmetic
// @category privacy
import { definePlugin, Styles } from "@mecord/api";

export default definePlugin({
  name: "Blur Images",
  settings: { amount: { type: "number", default: 14, label: "Blur strength (px)", min: 2, max: 40 } },
  start(ctx) {
    const apply = () => Styles.set("plugin-blur-images",
      `[id^="message-accessories-"] img:not([class*="emoji"]),[id^="message-accessories-"] video,[class*="imageWrapper"] img{filter:blur(${ctx.settings.get<number>("amount")}px);transition:filter .15s}
       [id^="message-accessories-"] img:hover,[id^="message-accessories-"] video:hover,[class*="imageWrapper"]:hover img{filter:none}`);
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-blur-images"));
  },
});
