// @name FPS & Memory Overlay
// @version 1.1.0
// @description A tiny overlay with the UI's frame rate, average frame time, 1% low and JS memory use. Handy for judging the Performance Suite.
// @tags performance, developer
// @category developer
import { definePlugin, Styles, h } from "@mecord/api";

const WINDOW = 300; // frames kept for the 1% low: about 5 s at 60 fps

export default definePlugin({
  name: "FPS & Memory Overlay",
  settings: { corner: { type: "select", default: "tr", label: "Corner", options: [{ label: "Top right", value: "tr" }, { label: "Top left", value: "tl" }, { label: "Bottom right", value: "br" }, { label: "Bottom left", value: "bl" }] } },
  start(ctx) {
    Styles.set("plugin-fps-counter", `.mecord-fps{position:fixed;z-index:2147482600;font:11px/1.2 Consolas,monospace;color:#8ff0b6;background:#000a;padding:3px 7px;border-radius:4px;pointer-events:none}`);
    const el = h("div", { class: "mecord-fps" });
    document.documentElement.append(el);
    const place = () => { const c = ctx.settings.get<string>("corner"); Object.assign(el.style, { top: c[0] === "t" ? "40px" : "auto", bottom: c[0] === "b" ? "8px" : "auto", left: c[1] === "l" ? "8px" : "auto", right: c[1] === "r" ? "8px" : "auto" }); };
    place(); ctx.add(ctx.settings.onChange(place));
    // Time between animation frames, newest last. Gaps of a second or more (window hidden, tab switched) are not frames.
    const gaps: number[] = [];
    let last = performance.now(), shown = last, raf = 0;
    const loop = (t: number) => {
      const dt = t - last; last = t;
      if (dt > 0 && dt < 1000) { gaps.push(dt); if (gaps.length > WINDOW) gaps.shift(); }
      if (t - shown >= 1000 && gaps.length) {
        shown = t;
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        // 1% low: the average of the slowest 1% of frames, shown as a frame rate.
        const worst = [...gaps].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(gaps.length / 100)));
        const low = worst.reduce((a, b) => a + b, 0) / worst.length;
        const mem = (performance as any).memory?.usedJSHeapSize;
        el.textContent = `${Math.round(1000 / avg)} fps · ${avg.toFixed(1)} ms · 1% low ${Math.round(1000 / low)}${mem ? ` · ${(mem / 1048576).toFixed(0)} MB` : ""}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    ctx.add(() => { cancelAnimationFrame(raf); el.remove(); Styles.remove("plugin-fps-counter"); });
  },
});
