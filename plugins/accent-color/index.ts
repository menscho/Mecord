// @name Accent Color
// @version 1.0.0
// @description Override Discord's brand/accent color.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `:root,.theme-dark,.theme-light,.theme-darker,.theme-midnight{--brand-500:${s.color}!important;--brand-560:${s.color}!important;--brand-600:${s.color}!important;--brand-experiment:${s.color}!important;--text-brand:${s.color}!important}`;

export default definePlugin({
  name: "Accent Color",
  settings: {
  color: {
    type: "string",
    default: "#7c5cff",
    label: "Accent color (CSS)"
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-accent-color", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-accent-color"));
  },
});
