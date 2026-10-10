// @name Session Clock
// @version 1.0.1
// @description Shows the time and how long Discord has been open this session, in a small corner badge.
// @tags utility
// @category tools
import { definePlugin, Styles, h } from "@mecord/api";

export default definePlugin({
  name: "Session Clock",
  settings: { seconds: { type: "boolean", default: false, label: "Show seconds" } },
  start(ctx) {
    Styles.set("plugin-session-clock", `.mecord-clock{position:fixed;z-index:2147482500;right:8px;bottom:8px;font:11px system-ui,sans-serif;color:#b5bac1;background:#1e1f22cc;padding:3px 8px;border-radius:4px;pointer-events:none}`);
    const el = h("div", { class: "mecord-clock" });
    document.documentElement.append(el);
    const t0 = Date.now();
    const tick = () => {
      const up = Math.floor((Date.now() - t0) / 60000);
      el.textContent = `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(ctx.settings.get("seconds") ? { second: "2-digit" } : {}) })} · up ${Math.floor(up / 60)}h ${up % 60}m`;
    };
    tick();
    // Nothing to show while the window is hidden, so the timer skips those ticks.
    ctx.every(1000, tick, { pauseWhenHidden: true });
    ctx.add(() => { el.remove(); Styles.remove("plugin-session-clock"); });
  },
});
