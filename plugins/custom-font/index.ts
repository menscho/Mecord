// @name Custom Font
// @version 1.0.0
// @description Use any installed font for the whole interface.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `html,body,button,input,textarea,[class*="markup"]{--font-primary:"${s.family}",sans-serif!important;--font-display:"${s.family}",sans-serif!important;font-family:"${s.family}",sans-serif!important}`;

export default definePlugin({
  name: "Custom Font",
  settings: {
  family: {
    type: "string",
    default: "Segoe UI",
    label: "Font family",
    placeholder: "Segoe UI, Inter, …"
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-custom-font", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-custom-font"));
  },
});
