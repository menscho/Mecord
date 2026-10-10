// @name Performance Suite
// @version 1.1.0
// @description Lighter effects, a faster member list, smoother typing and optional GPU and renderer flags.
// @tags performance
// @category developer
import { definePlugin, Styles, Toasts, h, type PluginCtx } from "@mecord/api";

const CSS = {
  // Not applied to chat messages: content-visibility/containment on message <li>s moves Discord's hover toolbar
  // (it deliberately overlaps the previous row), so it sat at different offsets on different messages.
  lists: `
    [data-list-item-id^="members-"]{content-visibility:auto;contain-intrinsic-size:auto 44px}`,
  // Only the few elements that use backdrop-filter. A page-wide rule made the browser check every element on each style pass.
  effects: `
    [class*="innerCloseButton"],[class*="audioButtonWithMenu"],[class*="buttonChevron"]{backdrop-filter:none!important}
    [class*="layer_"],[class*="popout_"]{box-shadow:none!important}
    [class*="avatarDecoration"],[class*="profileEffects"]{display:none!important}`,
  typing: `
    [role="textbox"][data-slate-editor="true"]{will-change:contents;contain:content}
    [class*="typing_"] [class*="dots"],[class*="typingIndicator"] *{animation:none!important}
    [class*="scroller_"]{scroll-behavior:auto!important}`,
  motion: `*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}`,
};

export default definePlugin({
  name: "Performance Suite",
  settings: {
    lists: { type: "boolean", default: true, label: "Fast member list", description: "Skip rendering members that are off-screen in big servers." },
    typing: { type: "boolean", default: true, label: "Smooth typing", description: "Isolate the chat box and stop idle animations near it." },
    effects: { type: "boolean", default: false, label: "Lighter effects", description: "Disable blur, shadows and avatar/profile effects." },
    motion: { type: "boolean", default: false, label: "Minimal animations" },
    gpu: { type: "boolean", default: false, label: "GPU boost (next launch)", description: "Starts Discord with GPU rasterization and zero-copy flags. Takes effect when Discord next starts; the Health page's Restart button applies it now." },
    skiaGraphite: { type: "boolean", default: false, label: "Skia Graphite renderer (experimental, next launch)", description: "Starts Discord with Chromium's Skia Graphite backend. Off by default; turn it off if Discord shows graphics glitches." },
  },
  start(ctx) {
    const apply = () => {
      const css = (Object.keys(CSS) as (keyof typeof CSS)[]).filter(k => ctx.settings.get<boolean>(k)).map(k => CSS[k]).join("\n");
      Styles.set("plugin-performance-suite", css);
    };
    apply();
    ctx.add(ctx.settings.onChange(apply));
    ctx.add(() => Styles.remove("plugin-performance-suite"));
  },
  renderSettings(el, ctx: PluginCtx) {
    const preset = (label: string, values: Record<string, boolean>) => h("button", {
      type: "button",
      style: { padding: "6px 12px", marginRight: "8px", borderRadius: "6px", border: "1px solid #2b2d31", background: "#2b2d31", color: "#dbdee1", cursor: "pointer" },
      onclick: () => { for (const [k, v] of Object.entries(values)) ctx.settings.set(k, v); Toasts.show(`${label} preset applied`, "success", { duration: 1500 }); },
    }, label);
    el.append(
      h("div", { style: { fontSize: "12px", color: "#b5bac1", margin: "10px 0 8px" } }, "Presets"),
      h("div", null,
        preset("Full effects", { lists: true, typing: true, effects: false, motion: false }),
        preset("Smooth", { lists: true, typing: true, effects: true, motion: true })),
    );
  },
});
