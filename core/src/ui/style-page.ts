// Style page: Quick CSS (with the editor), the wallpaper, and the window's own options.
import { h, Toasts } from "../features";
import { config, saveConfig } from "../plugins";
import { setQuickCss, applyWallpaper, restyleWallpaper } from "../themes";
import { cssEditor } from "../quickcss";
import { S, hooks, Mount, sw, seg, btn, modal } from "./shell";

const EXAMPLES: [string, string][] = [
  ["Round avatars", `[class*="avatar_"]{border-radius:50%!important}`],
  ["Tighter messages", `[class*="message_"]{padding-top:2px!important;padding-bottom:2px!important}`],
  ["Hide the Nitro button", `[class*="nitroWrapper"]{display:none!important}`],
];

function cssPage(body: HTMLElement, head: HTMLElement) {
  head.append(
    btn("Copy", () => navigator.clipboard?.writeText(config.quickCss).then(() => Toasts.show("Copied your CSS", "success")).catch(() => {}), "ghost", "copy"),
    btn("Clear", async () => {
      if (!config.quickCss) return;
      if (!(await modal("Clear your Quick CSS?", [h("p", null, "All of it is removed. Copy it first if you might want it back.")], "Clear", true))) return;
      setQuickCss(""); hooks.refresh();
    }, "ghost"));
  body.append(h("div", { class: "note" }, h("div", { class: "grow" },
    "Applied as you type, after every theme, so it wins. Suggestions appear as you type a CSS property or a Discord colour variable: Tab or Enter accepts.")));
  body.append(cssEditor(config.quickCss, v => setQuickCss(v), "/* Anything you type here applies instantly and overrides themes. */\n"));
  body.append(h("div", { class: "card" }, h("h3", { class: "display" }, "Starting points"),
    h("p", null, "Add one to the end of your CSS, then tweak it."),
    h("div", { class: "chips" }, ...EXAMPLES.map(([label, css]) => btn(label, () => {
      setQuickCss(config.quickCss ? `${config.quickCss.replace(/\s*$/, "")}\n\n${css}\n` : `${css}\n`);
      hooks.refresh();
    }, "ghost")))));
}

function wallpaperPage(body: HTMLElement) {
  const w = config.wallpaper;
  const kind = h("select", { "aria-label": "Wallpaper type" }, ...[["none", "None"], ["image", "Image"], ["video", "Video"]].map(([v, l]) => h("option", { value: v, selected: w.kind === v }, l)));
  kind.addEventListener("change", () => { w.kind = kind.value as any; saveConfig(); applyWallpaper(); });
  const src = h("input", { type: "text", value: w.src, placeholder: "C:\\Pictures\\wall.jpg   or   https://…", style: { width: "100%" }, "aria-label": "Wallpaper file or link" }) as HTMLInputElement;
  src.addEventListener("change", () => { w.src = src.value.trim(); if (w.kind === "none" && w.src) { w.kind = /\.(mp4|webm|mkv)(\?|$)/i.test(w.src) ? "video" : "image"; kind.value = w.kind; } saveConfig(); applyWallpaper(); });
  const slider = (label: string, key: "opacity" | "blur" | "dim", min: number, max: number, step: number) => {
    const i = h("input", { type: "range", min, max, step, value: String(w[key]), "aria-label": label });
    i.addEventListener("input", () => { w[key] = Number(i.value); saveConfig(); restyleWallpaper(); });
    return h("div", { class: "range" }, h("label", null, label), i);
  };
  const lab = (t: string) => h("label", { class: "lab", style: { display: "block", marginBottom: "5px" } }, t);
  body.append(h("div", { class: "card" }, h("h3", { class: "display" }, "Background"), h("p", null, "Show a picture or a looping video behind the chat. Video pauses when Discord isn't focused. Blur applies to pictures only."),
    h("div", null, lab("Type"), kind), h("div", { style: { marginTop: "12px" } }, lab("File path or link"), src),
    slider("Opacity", "opacity", 0, 1, 0.05), slider("Blur", "blur", 0, 30, 1), slider("Darken", "dim", 0, 0.9, 0.05),
    h("div", { style: { marginTop: "14px" } }, btn("Remove wallpaper", () => { w.kind = "none"; w.src = ""; saveConfig(); applyWallpaper(); hooks.refresh(); }, "ghost"))));
}

function windowPage(body: HTMLElement) {
  body.append(h("div", { class: "card" }, h("h3", { class: "display" }, "Window"),
    h("p", null, "The Mecord window takes its colours from whatever Discord theme is active, so it always matches the rest of the app. Its layout and text follow Discord too."),
    h("div", { class: "set", style: { borderTop: 0 } }, h("div", { class: "l" }, h("b", null, "Show the M button"), h("small", null, "The gray M next to Discord's inbox opens this window.")),
      sw(config.ui.button, "Show the M button", v => { config.ui.button = v; saveConfig(); window.dispatchEvent(new CustomEvent("mecord:titlebutton")); })),
    h("div", { class: "set" }, h("div", { class: "l" }, h("b", null, "Open with a shortcut"), h("small", null, "Ctrl+Shift+M opens and closes this window. Change it under Shortcuts.")),
      btn("Shortcuts", () => { S.page = "keys"; hooks.render(); }, "ghost", "keys"))));
}

export const mountStyle: Mount = (tools, head, body) => {
  tools.append(seg([["css", "Quick CSS"], ["wallpaper", "Wallpaper"], ["interface", "Window"]], S.sub.style, id => { S.sub.style = id; hooks.render(); }));
  const build = () => {
    if (S.sub.style === "css") cssPage(body, head);
    else if (S.sub.style === "wallpaper") wallpaperPage(body);
    else windowPage(body);
  };
  build();
  return () => { body.replaceChildren(); build(); };
};
