// @name Code Font
// @version 1.0.0
// @description Choose the font used in code blocks and inline code.
// @tags cosmetic
// @category look
import { definePlugin, Styles } from "@mecord/api";

const build = s => `code,pre,[class*="codeBlock"],[class*="inlineCode"],[class*="hljs"]{font-family:"${s.family}",Consolas,monospace!important}`;

export default definePlugin({
  name: "Code Font",
  settings: {
  family: {
    type: "string",
    default: "Cascadia Code",
    label: "Monospace font"
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-code-font", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-code-font"));
  },
});
