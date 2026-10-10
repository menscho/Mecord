// @name Wide Chat
// @version 1.0.0
// @description Lets messages use the full width, or limits them to a readable column.
// @tags cosmetic
// @category layout
import { definePlugin, Styles } from "@mecord/api";

const build = s => s.max > 0 ? `[class*="messagesWrapper"] ol,[class*="scrollerInner"]>ol{max-width:${s.max}px;margin-inline:auto}` : `[class*="messagesWrapper"] ol{max-width:none!important}`;

export default definePlugin({
  name: "Wide Chat",
  settings: {
  max: {
    type: "number",
    default: 0,
    label: "Max width in px (0 = full width)",
    min: 0,
    max: 3000
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-wide-chat", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-wide-chat"));
  },
});
