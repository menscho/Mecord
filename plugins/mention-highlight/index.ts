// @name Mention Highlight
// @version 1.0.0
// @description Colors your own mentions and mention-messages distinctively.
// @tags cosmetic, chat
// @category chat
import { definePlugin, Styles } from "@mecord/api";

const build = s => `[class*="mentioned_"]{background:${s.color}1a!important;box-shadow:inset 3px 0 0 ${s.color}!important}.mention[class*="wrapper"],[class*="mention"][class*="interactive"]{color:${s.color}!important}`;

export default definePlugin({
  name: "Mention Highlight",
  settings: {
  color: {
    type: "string",
    default: "#ff9f1c",
    label: "Color (CSS)"
  }
},
  start(ctx) {
    const apply = () => Styles.set("plugin-mention-highlight", build(ctx.settings.all() as any));
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-mention-highlight"));
  },
});
