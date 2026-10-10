// @name Silent Typing
// @version 1.0.1
// @description Hides your "is typing…" indicator from everyone. Toggle at any time with /silent-typing.
// @tags privacy
// @category privacy
import { definePlugin, Webpack, Toasts, Commands } from "@mecord/api";
import { wrap, onFound } from "../_lib";

export default definePlugin({
  name: "Silent Typing",
  settings: { active: { type: "boolean", default: true, label: "Hide typing indicator" } },
  start(ctx) {
    onFound(ctx, () => Webpack.findByProps("startTyping", "stopTyping"), T => {
      ctx.add(wrap(T, "startTyping", orig => function (this: any, ...a: any[]) {
        if (ctx.settings.get<boolean>("active")) return;
        return orig.apply(this, a);
      }));
    }, "typing actions");
    ctx.add(Commands.register({
      name: "silent-typing", description: "Toggle hiding your typing indicator",
      execute() {
        const v = !ctx.settings.get<boolean>("active");
        ctx.settings.set("active", v);
        Toasts.show(v ? "Typing indicator hidden" : "Typing indicator visible", "info", { duration: 1800 });
      },
    }));
  },
});
