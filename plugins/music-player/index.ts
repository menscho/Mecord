// @name Music Player
// @version 1.0.0
// @description Now-playing widget with play/pause/skip for whatever Windows is playing (Spotify, browsers, media players), plus /nowplaying. Uses a native helper (PowerShell) and asks for your consent first.
// @tags media, native
// @native ps1 media.ps1
// @capabilities native:media-session
// @category media
import { definePlugin, Commands, Styles, Toasts, h } from "@mecord/api";

interface Now { title: string; artist: string; album: string; app: string; playing: boolean; position: number; duration: number }

export default definePlugin({
  name: "Music Player",
  settings: {
    widget: { type: "boolean", default: true, label: "Show now-playing widget" },
    interval: { type: "number", default: 3, label: "Refresh every (seconds)", min: 1, max: 30 },
  },
  start(ctx) {
    Styles.set("plugin-music-player", `.mecord-mp{position:fixed;left:84px;bottom:68px;z-index:2147482500;background:#1e1f22ee;color:#dbdee1;border-radius:10px;padding:8px 10px;display:flex;gap:10px;align-items:center;font:12.5px/1.25 system-ui,sans-serif;box-shadow:0 6px 20px #0009;max-width:300px;backdrop-filter:blur(6px)}
      .mecord-mp b{display:block;color:#fff;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mecord-mp span{display:block;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.7}
      .mecord-mp button{background:none;border:0;color:#fff;cursor:pointer;font-size:15px;padding:2px 4px;opacity:.85}.mecord-mp button:hover{opacity:1}
      .mecord-mp .bar{height:2px;background:#ffffff22;border-radius:1px;margin-top:4px}.mecord-mp .bar i{display:block;height:100%;background:#7c5cff;border-radius:1px}`);
    const title = h("b"), sub = h("span"), fill = h("i"), play = h("button", { title: "Play / pause", onclick: () => cmd("toggle") }, "⏯");
    const w = h("div", { class: "mecord-mp", style: { display: "none" } },
      h("button", { title: "Previous", onclick: () => cmd("prev") }, "⏮"), h("div", null, title, sub, h("div", { class: "bar" }, fill)), play, h("button", { title: "Next", onclick: () => cmd("next") }, "⏭"));
    document.body.append(w);
    let last: Now | null = null, stopped = false, failed = false;
    async function cmd(m: string) { try { await ctx.native.call(m); setTimeout(poll, 250); } catch (e: any) { Toasts.show("Music Player: " + e.message, "error"); } }
    async function poll() {
      if (stopped || failed) return;
      try {
        last = await ctx.native.call<Now | null>("now");
      } catch (e: any) {
        failed = true; ctx.log.error("helper failed", e); Toasts.show("Music Player helper unavailable: " + e.message, "error", { duration: 6000 }); w.style.display = "none"; return;
      }
      if (!last || !last.title || !ctx.settings.get("widget")) { w.style.display = "none"; return; }
      w.style.display = "flex";
      title.textContent = last.title; sub.textContent = last.artist || last.app;
      play.textContent = last.playing ? "⏸" : "▶";
      fill.style.width = last.duration ? Math.min(100, (last.position / last.duration) * 100) + "%" : "0%";
    }
    poll();
    const iv = setInterval(poll, Math.max(1, ctx.settings.get<number>("interval")) * 1000);
    ctx.add(() => { stopped = true; clearInterval(iv); w.remove(); Styles.remove("plugin-music-player"); });
    ctx.add(Commands.register({
      name: "nowplaying", description: "Share what you're listening to",
      async execute() {
        const n = await ctx.native.call<Now | null>("now");
        if (!n?.title) { Toasts.show("Nothing is playing", "info"); return; }
        return { content: `🎵 ${n.title}${n.artist ? " — " + n.artist : ""}` };
      },
    }));
  },
});
