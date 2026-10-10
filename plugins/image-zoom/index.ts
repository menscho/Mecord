// @name Image Zoom
// @version 1.0.1
// @description Hold Alt while hovering an image in chat to magnify it under the cursor.
// @tags media
// @category media
import { definePlugin, Styles, h } from "@mecord/api";

export default definePlugin({
  name: "Image Zoom",
  settings: {
    zoom: { type: "number", default: 3, label: "Magnification", min: 1.5, max: 8 },
    size: { type: "number", default: 280, label: "Lens size (px)", min: 120, max: 600 },
  },
  start(ctx) {
    Styles.set("plugin-image-zoom", `.mecord-zoom{position:fixed;z-index:2147483000;border-radius:50%;border:2px solid #fff;box-shadow:0 6px 24px #000b;pointer-events:none;background-repeat:no-repeat;display:none}`);
    const lens = h("div", { class: "mecord-zoom" });
    document.documentElement.append(lens);
    let alt = false, pending: MouseEvent | null = null, raf = 0, shown = "";
    const hide = () => (lens.style.display = "none");
    // Painted at most once per frame, from the latest mouse position: mousemove can fire faster than the screen refreshes.
    const paint = () => {
      raf = 0;
      const e = pending; pending = null;
      if (!e) return;
      const img = (e.target as HTMLElement).closest?.("img") as HTMLImageElement | null;
      if (!img || img.naturalWidth < 80 || img.closest('[class*="avatar"]') || img.closest("button")) return hide();
      const r = img.getBoundingClientRect(), z = ctx.settings.get<number>("zoom"), s = ctx.settings.get<number>("size");
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const src = img.currentSrc || img.src;
      if (src !== shown) { lens.style.backgroundImage = `url("${src}")`; shown = src; } // only when the picture changes
      Object.assign(lens.style, {
        display: "block", width: s + "px", height: s + "px", left: e.clientX - s / 2 + "px", top: e.clientY - s / 2 + "px",
        backgroundSize: `${r.width * z}px ${r.height * z}px`,
        backgroundPosition: `${-(fx * r.width * z - s / 2)}px ${-(fy * r.height * z - s / 2)}px`,
      });
    };
    const move = (e: MouseEvent) => {
      if (!alt) return;
      pending = e;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const key = (e: KeyboardEvent) => {
      alt = e.altKey;
      if (!alt) { hide(); cancelAnimationFrame(raf); raf = 0; pending = null; }
    };
    const onBlur = () => { alt = false; hide(); };
    document.addEventListener("mousemove", move, true);
    window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true); window.addEventListener("blur", onBlur);
    ctx.add(() => {
      document.removeEventListener("mousemove", move, true);
      window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true); window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(raf); lens.remove(); Styles.remove("plugin-image-zoom");
    });
  },
});
