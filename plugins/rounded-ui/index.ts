// @name Rounded UI
// @version 1.0.0
// @description Adjust the corner radius of panels and messages.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `[class*="message_"],[class*="embedWrapper"],[class*="popout_"],[class*="searchBar"]{border-radius:${s.radius}px!important}`;

export default definePlugin({
  name: "Rounded UI",
  settings: {
  radius: {
    type: "number",
    default: 10,
    label: "Radius (px)",
    min: 0,
    max: 30
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-rounded-ui", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-rounded-ui"));
  },
});
