// Health page: patches, plugin errors, startup times, the log, the patch editor, and a diagnostics export.
import { call } from "../bridge";
import { h, Toasts } from "../features";
import { loaded, config, LoadedPlugin } from "../plugins";
import * as W from "../webpack";
import { jankSummary } from "../perf";
import { S, hooks, Mount, btn, pill, seg, openFolder } from "./shell";
import { titlePlaced } from "./titlebtn";

/** The report the page copies and exports: enough to diagnose a problem without seeing the user's settings. */
export function report() {
  return JSON.stringify({
    host: S.hostInfo,
    stats: W.stats,
    titleButton: titlePlaced() ? "shown" : "not found in this Discord build",
    store: S.store ? { plugins: S.store.plugins.length, themes: S.store.themes?.length ?? 0, verified: !!S.store.verified, error: S.store.error ?? null } : null,
    patches: W.patches.map(p => ({ plugin: p.plugin, find: String(p.def.find), module: p.moduleId, state: p.state, detail: p.detail })),
    plugins: [...loaded.values()].map(l => ({ id: l.entry.id, v: l.entry.version, origin: l.entry.origin, state: l.state, startMs: l.startMs !== undefined ? Math.round(l.startMs) : null, error: l.error })),
    look: { layout: config.look.layout, theme: config.themes.find(t => t.builtin && t.enabled)?.id ?? "" },
    longFrames: jankSummary(),
  }, null, 2);
}

/** What the host reports about Chromium's GPU use (see gpu.status in src/host.rs). */
interface GpuStatus {
  devices: { name?: string; driver?: string }[];
  features: Record<string, string> | null;
  driverWorkarounds: number;
}
const KEY_FEATURES = ["gpu_compositing", "rasterization", "video_decode", "webgl", "2d_canvas", "skia_graphite"];

function performanceView(body: HTMLElement) {
  const j = jankSummary();
  const headline = !j.supported ? "Frame monitor isn't available in this Discord build"
    : j.frames ? `${j.frames} slow frame${j.frames === 1 ? "" : "s"} in the last minute (worst ${j.worstMs.toFixed(0)} ms)`
    : "No slow frames in the last minute";
  body.append(h("div", { class: "note" + (j.frames ? " warn" : "") }, h("div", { class: "grow" },
    h("b", null, headline),
    h("div", { style: { color: "var(--muted)" } }, "A frame longer than 50 ms shows as a stutter. The table says which code ran during those frames.")),
    btn("Refresh", () => hooks.render(), "ghost", "refresh")));
  if (j.byLabel.length) body.append(h("table", null,
    h("thead", null, h("tr", null, ...["Code", "Time in slow frames", "Frames"].map(x => h("th", null, x)))),
    h("tbody", null, ...j.byLabel.map(r => h("tr", null, h("td", null, r.label), h("td", { class: "mono" }, `${r.ms.toFixed(0)} ms`), h("td", { class: "mono" }, String(r.frames)))))));
}

function graphicsView(body: HTMLElement) {
  const box = h("div", null, h("div", { style: { color: "var(--muted)" } }, "Reading the graphics status…"));
  body.append(h("div", { class: "note" }, h("div", { class: "grow" },
    h("b", null, "Graphics"),
    h("div", { style: { color: "var(--muted)" } }, "What Chromium is using to draw Discord. Launch flags from the Performance Suite apply when Discord starts, so restart it after changing them."))),
    btn("Restart Discord to apply", async () => {
      try { if (!(await call<boolean>("discord.restart"))) Toasts.show("Restart cancelled", "info"); }
      catch (e: any) { Toasts.show("Couldn't restart: " + e.message, "error"); }
    }, "primary", "refresh"), box);
  call<GpuStatus>("gpu.status").then(g => {
    const feats: Record<string, string> = g.features ?? {}, devices = g.devices ?? [];
    // "disabled_off" is a feature that is simply off by default (for example Skia Graphite), not a problem.
    const tone = (s: string) => (s.startsWith("enabled") ? "ok" : s.startsWith("disabled_off") ? "" : "warn");
    const parts: (Node | string)[] = [
      h("div", { style: { margin: "8px 0", color: "var(--muted)" } }, devices.length ? devices.map(d => `${d.name || "GPU"}${d.driver ? " · driver " + d.driver : ""}`).join("  ·  ") : "No GPU reported"),
      h("table", null,
        h("thead", null, h("tr", null, ...["Feature", "State"].map(x => h("th", null, x)))),
        h("tbody", null, ...KEY_FEATURES.filter(k => k in feats).map(k => h("tr", null, h("td", null, k.replace(/_/g, " ")), h("td", null, pill(feats[k], tone(feats[k]))))))),
    ];
    if (feats.rasterization === "enabled_force") parts.push(h("div", { class: "note" }, "GPU rasterization is forced, so the Performance Suite's GPU boost flags are active."));
    if (g.driverWorkarounds > 0) parts.push(h("div", { style: { color: "var(--muted)", marginTop: "8px", fontSize: "12px" } }, `Chromium applies ${g.driverWorkarounds} driver workaround${g.driverWorkarounds === 1 ? "" : "s"} on this GPU. Usually harmless.`));
    box.replaceChildren(...parts);
  }).catch(e => box.replaceChildren(h("div", { class: "note bad" }, "Couldn't read the graphics status: " + e.message)));
}

function patchesView(body: HTMLElement) {
  const counts: Record<string, number> = {};
  for (const p of W.patches) counts[p.state] = (counts[p.state] ?? 0) + 1;
  const reload = counts["needs-reload"] ?? 0;
  body.append(h("div", { class: "note" + (reload ? " warn" : "") }, h("div", { class: "grow" },
    h("b", null, W.patches.length ? `${W.patches.length} patch${W.patches.length === 1 ? "" : "es"} registered` : "No patches registered"),
    h("div", { style: { color: "var(--muted)" } }, `Discord ${S.hostInfo.discordVersion ?? "?"} · ${W.wreq ? Object.keys(W.wreq.m).length : "–"} modules · ` + (Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing to patch"))),
    reload ? btn("Reload to apply", () => location.reload(), "primary") : null));
  if (!W.patches.length) return;
  const tone: Record<string, string> = { applied: "ok", pending: "", nomatch: "bad", evalerror: "bad", "needs-reload": "warn", disabled: "", stale: "warn" };
  body.append(h("table", null, h("thead", null, h("tr", null, ...["Plugin", "Targets", "Module", "State", ""].map(x => h("th", null, x)))),
    h("tbody", null, ...W.patches.map(p => h("tr", null, h("td", null, p.plugin), h("td", { class: "mono" }, String(p.def.find).slice(0, 44)), h("td", { class: "mono" }, p.moduleId ?? "–"), h("td", null, pill(p.state, tone[p.state])), h("td", { style: { color: "var(--muted)" } }, p.detail ?? ""))))));
}

function errorsView(body: HTMLElement) {
  const bad = [...loaded.values()].filter(l => l.state === "error");
  if (!bad.length) { body.append(h("div", { class: "empty" }, h("b", null, "No plugin errors"), "Every plugin that's turned on started normally.")); return; }
  for (const l of bad) body.append(h("div", { class: "row nosw" }, h("div", { class: "main" }, h("div", { class: "t" }, h("b", null, l.entry.name), pill("Error", "bad")), h("pre", null, l.error ?? ""))));
}

function startupView(body: HTMLElement) {
  const started = [...loaded.values()].filter((l: LoadedPlugin) => l.startMs !== undefined && l.state === "started").sort((a, b) => (b.startMs ?? 0) - (a.startMs ?? 0));
  if (!started.length) { body.append(h("div", { class: "empty" }, h("b", null, "Nothing has started yet"), "Turn a plugin on and its startup time appears here.")); return; }
  const total = started.reduce((s, l) => s + (l.startMs ?? 0), 0), max = started[0].startMs ?? 1;
  body.append(h("div", { class: "note" }, h("div", { class: "grow" }, h("b", null, `${started.length} plugins started in ${total.toFixed(0)} ms in total`),
    h("div", { style: { color: "var(--muted)" } }, "How long each plugin's start() took. Expensive ones are at the top."))));
  const bar = (ms: number) => h("div", { class: "bar2" }, h("i", { style: { width: `${(ms / max) * 100}%` } }));
  const rows = started.map(l => h("tr", null,
    h("td", null, l.entry.name),
    h("td", { class: "mono" }, `${(l.startMs ?? 0).toFixed(1)} ms`),
    h("td", { style: { width: "40%" } }, bar(l.startMs ?? 0))));
  body.append(h("table", null,
    h("thead", null, h("tr", null, ...["Plugin", "Startup", ""].map(x => h("th", null, x)))),
    h("tbody", null, ...rows)));
}

function logView(body: HTMLElement) {
  const pre = h("pre", { style: { maxHeight: "520px" } }, "Loading the log…");
  const load = () => call<{ text: string }>("log.tail", { lines: 400 }).then(r => { pre.textContent = r.text || "The log is empty."; pre.scrollTop = pre.scrollHeight; }).catch(e => { pre.textContent = "Couldn't read the log: " + e.message; });
  body.append(h("div", { class: "acts", style: { marginTop: 0, marginBottom: "8px" } }, btn("Refresh", load, "ghost", "refresh"), btn("Open logs folder", () => openFolder("logs"), "ghost", "folder")), pre);
  void load();
}

function editorView(body: HTMLElement) {
  const find = h("input", { type: "text", placeholder: "A string unique to the module, e.g. getBuiltInCommands", style: { width: "100%" }, "aria-label": "Find" }) as HTMLInputElement;
  const mods = h("div", { class: "chips", style: { marginTop: "2px" } });
  const match = h("input", { type: "text", placeholder: "Regex to replace. Use \\i for any identifier", style: { width: "100%" }, "aria-label": "Match" }) as HTMLInputElement;
  const repl = h("input", { type: "text", placeholder: "Replacement. $1 for groups, $self for your plugin", style: { width: "100%" }, "aria-label": "Replace with" }) as HTMLInputElement;
  const out = h("div"), nameIn = h("input", { type: "text", value: "my-patch", style: { width: "170px" }, "aria-label": "New plugin name" }) as HTMLInputElement;
  let modId = "";
  const test = () => {
    out.replaceChildren(); if (!modId || !match.value) return;
    const src = W.moduleSource(modId)!; let rx: RegExp;
    try { rx = W.regexFromSource(match.value); } catch (e: any) { out.append(h("div", { class: "err" }, "That isn't a valid regex: " + e.message)); return; }
    const m = rx.exec(src);
    if (!m) { out.append(h("div", { class: "note warn" }, "The regex doesn't match module " + modId + ".")); return; }
    const patched = src.replace(rx, repl.value.replace(/\$self/g, "Mecord.plugins.self('your-plugin')"));
    let compile = "ok"; try { (0, eval)("0," + patched + "\n//# sourceURL=MecordPatchTest"); } catch (e: any) { compile = String(e.message); }
    out.append(h("div", { style: { margin: "12px 0 4px" } }, pill("Matches", "ok"), " ", pill(compile === "ok" ? "Compiles" : "Won't compile: " + compile, compile === "ok" ? "ok" : "bad")),
      h("div", { style: { color: "var(--muted)" } }, "Before"), h("pre", null, src.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70)),
      h("div", { style: { color: "var(--muted)" } }, "After"), h("pre", null, patched.slice(Math.max(0, m.index - 70), m.index + repl.value.length + 140)),
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, nameIn, btn("Save as plugin", async () => {
        const id = nameIn.value.trim(); if (!/^[a-z0-9-]+$/i.test(id)) { Toasts.show("Use letters, digits and dashes for the name", "warning"); return; }
        try { await call("userplugin.create", { id, find: find.value, match: match.value, replace: repl.value }); Toasts.show(`Saved ${id}. Turn it on under Plugins.`, "success", { duration: 5000 }); } catch (e: any) { Toasts.show(e.message, "error"); }
      }, "primary")), h("div", { style: { color: "var(--muted)", marginTop: "8px" } }, "The module already ran, so use Reload Discord UI after saving."));
  };
  let st: any;
  find.addEventListener("input", () => { clearTimeout(st); st = setTimeout(() => {
    mods.replaceChildren(); modId = ""; out.replaceChildren(); if (!find.value) return;
    const res = W.searchModules(find.value, 14);
    if (!res.length) { mods.append(h("span", { style: { color: "var(--muted)" } }, "No module contains that.")); return; }
    for (const r of res) mods.append(h("button", { class: "chip", "aria-pressed": "false", onclick: (e: Event) => { modId = r.id; mods.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false")); (e.currentTarget as HTMLElement).setAttribute("aria-pressed", "true"); test(); } }, r.id + (r.loaded ? " · ran" : "")));
    if (res.length === 1) (mods.firstElementChild as HTMLElement).click();
  }, 250); });
  match.addEventListener("input", test); repl.addEventListener("input", test);
  body.append(h("div", { class: "note" }, h("div", { class: "grow" }, "Try a patch against Discord's live code. Nothing is applied from here.")),
    h("div", { style: { display: "grid", gap: "10px", marginTop: "12px" } }, find, mods, match, repl), out);
}

export const mountHealth: Mount = (tools, head, body) => {
  head.append(
    btn("Copy report", () => navigator.clipboard.writeText(report()).then(() => Toasts.show("Report copied", "success")), "ghost"),
    btn("Export diagnostics", async () => {
      try {
        await call("diagnostics.export", { report: report() });
        Toasts.show("Diagnostics saved for a bug report", "success", { duration: 7000, action: { label: "Show file", run: () => openFolder("logs") } });
      } catch (e: any) { Toasts.show("Couldn't export: " + e.message, "error"); }
    }, "ghost", "folder"),
    btn("Reload Discord UI", () => location.reload(), "primary", "refresh"));
  tools.append(seg([["patches", "Patches"], ["plugins", "Plugin errors"], ["startup", "Startup"], ["performance", "Performance"], ["logs", "Log"], ["editor", "Patch editor"]], S.sub.health, id => { S.sub.health = id; hooks.render(); }));
  const build = () => {
    body.replaceChildren();
    if (S.hostInfo.safe) body.append(h("div", { class: "note bad" }, h("div", { class: "grow" }, h("b", null, "Safe mode is on"), h("div", null, "Mecord failed to start several times, so plugins and themes are off. Leave safe mode, then restart Mecord to try again.")),
      btn("Leave safe mode", async () => { await call("host.clearSafeMode"); Toasts.show("Safe mode cleared. Restart Mecord to load plugins.", "success", { duration: 6000 }); }, "primary")));
    body.append(h("div", { class: "note" + (titlePlaced() ? "" : " warn") }, h("div", { class: "grow" },
      h("b", null, "The M button"), h("div", { style: { color: "var(--muted)" } }, titlePlaced() ? "It's in the title bar." : "It couldn't be placed. Discord's title bar may have changed. Ctrl+Shift+M still opens Mecord.")),
      !titlePlaced() && btn("Try again", () => { window.dispatchEvent(new CustomEvent("mecord:titlebutton")); hooks.refresh(); }, "ghost")));
    const sub = S.sub.health;
    if (sub === "patches") patchesView(body);
    else if (sub === "plugins") errorsView(body);
    else if (sub === "startup") startupView(body);
    else if (sub === "performance") { performanceView(body); graphicsView(body); }
    else if (sub === "logs") logView(body);
    else editorView(body);
  };
  build();
  return () => build();
};
