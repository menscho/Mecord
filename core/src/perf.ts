// Slow-frame monitor. Chromium reports every frame that took longer than 50 ms, with the scripts that ran in it.
// Mecord tags its code with sourceURLs (the core, each plugin, each patched Discord module), so the time can be
// charged to a plugin rather than to "Discord".
import { loaded } from "./plugins";
import * as W from "./webpack";

const WINDOW_MS = 60_000;
const KEEP = 300;

interface Frame { at: number; ms: number; by: Map<string, number> }
let frames: Frame[] = [];
let supported = false;

function labelOf(s: any): string {
  const url: string = s.sourceURL || "";
  let m = /mecord-plugin\/(.+?)\.js/.exec(url);
  if (m) return "Plugin: " + (loaded.get(m[1])?.entry.name ?? m[1]);
  m = /MecordWebpack\/(\d+)/.exec(url);
  if (m) {
    const id = m[1];
    const names = [...new Set(W.patches.filter(p => p.moduleId === id).map(p => p.plugin))];
    return names.length ? "Patched Discord code (" + names.join(", ") + ")" : "Patched Discord code";
  }
  if (url === "MecordCore.js") return "Mecord core";
  return "Discord";
}

function record(e: any) {
  const by = new Map<string, number>();
  let scripts = 0;
  for (const s of e.scripts ?? []) {
    const k = labelOf(s);
    by.set(k, (by.get(k) ?? 0) + (s.duration ?? 0));
    scripts += s.duration ?? 0;
  }
  // The part of the frame that no script accounts for is rendering and layout.
  const rest = (e.duration ?? 0) - scripts;
  if (rest > 1) by.set("Rendering and layout", (by.get("Rendering and layout") ?? 0) + rest);
  frames.push({ at: performance.now(), ms: e.duration ?? 0, by });
  trim();
}

function trim() {
  const cutoff = performance.now() - WINDOW_MS;
  frames = frames.filter(f => f.at >= cutoff).slice(-KEEP);
}

/** Starts recording slow frames (no-op where Chromium lacks the entry type). */
export function startJankMonitor() {
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries()) record(e); }).observe({ type: "long-animation-frame" } as any);
    supported = true;
  } catch {
    supported = false;
  }
}

export interface JankSummary {
  supported: boolean;
  frames: number;
  totalMs: number;
  worstMs: number;
  byLabel: { label: string; ms: number; frames: number }[];
}

/** The last minute of slow frames, with the time each kind of code took in them. */
export function jankSummary(): JankSummary {
  trim();
  const agg = new Map<string, { ms: number; frames: number }>();
  for (const f of frames) for (const [label, ms] of f.by) {
    const a = agg.get(label) ?? { ms: 0, frames: 0 };
    a.ms += ms; a.frames++;
    agg.set(label, a);
  }
  return {
    supported,
    frames: frames.length,
    totalMs: frames.reduce((s, f) => s + f.ms, 0),
    worstMs: frames.reduce((m, f) => Math.max(m, f.ms), 0),
    byLabel: [...agg].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.ms - a.ms).slice(0, 8),
  };
}
