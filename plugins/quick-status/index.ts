// @name Quick Status
// @version 1.0.0
// @description /status online|idle|dnd|invisible changes your presence without opening menus.
// @tags commands, utility
// @category tools
import { definePlugin, Commands, Toasts, Webpack } from "@mecord/api";

const MAP: Record<string, string> = { online: "online", idle: "idle", away: "idle", dnd: "dnd", busy: "dnd", invisible: "invisible", offline: "invisible" };

export default definePlugin({
  name: "Quick Status",
  start(ctx) {
    ctx.add(Commands.register({
      name: "status", description: "Set your status: online, idle, dnd or invisible",
      options: [{ name: "status", description: "online | idle | dnd | invisible", required: true }],
      async execute(a) {
        const status = MAP[String(a.status).toLowerCase().trim()];
        if (!status) { Toasts.show("Use online, idle, dnd or invisible", "warning"); return; }
        const rest = Webpack.findByProps("get", "post", "put", "patch", "del");
        if (!rest) { Toasts.show("Discord's HTTP client was not found", "error"); return; }
        try { await rest.patch({ url: "/users/@me/settings", body: { status } }); Toasts.show(`Status set to ${status}`, "success", { duration: 1800 }); }
        catch (e: any) { Toasts.show("Could not change status: " + (e?.body?.message ?? e?.message ?? e), "error"); }
      },
    }));
  },
});
