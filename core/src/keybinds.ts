// One place for keyboard shortcuts: Mecord's own, plugin shortcuts, and the user's rebinds.
// Combos are canonical strings such as "Ctrl+Alt+Z". An empty combo means "unbound".
import type { Dispose } from "./features";

export interface KeybindDef {
  id: string;
  label: string;
  /** Where the shortcut is listed, e.g. "Mecord" or the plugin's name. */
  group: string;
  /** Default combo. Overridden by the user's rebind when one exists. */
  combo: string;
  run(): void;
  /** Bindings without Ctrl, Alt or Win are ignored while typing unless this is set. */
  allowInInput?: boolean;
}

const registry = new Map<string, KeybindDef>();
let overrides: Record<string, string> = {};
let saver: () => void = () => {};
let capturing = false;

/** Asked in order when Escape is pressed. A hook returns true if it used the key (closing a popup, clearing a field). */
export const escapeHooks: (() => boolean)[] = [];
/** While the Shortcuts page is recording a new combo, normal shortcuts must not fire. */
export const setCapturing = (v: boolean) => { capturing = v; };

export const setKeybindOverrides = (o: Record<string, string>) => { overrides = { ...(o ?? {}) }; };
export const setKeybindSaver = (fn: () => void) => { saver = fn; };

export const effectiveCombo = (d: KeybindDef) => (d.id in overrides ? overrides[d.id] : d.combo);

const KEY_NAMES: Record<string, string> = { " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Esc", Enter: "Enter", Backspace: "Backspace", Delete: "Delete", Tab: "Tab", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown" };
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"]);

/** Canonical combo for a keyboard event, or null for a lone modifier. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  let key = e.code || e.key;
  if (/^Key[A-Z]$/.test(key)) key = key.slice(3);
  else if (/^Digit[0-9]$/.test(key)) key = key.slice(5);
  else if (/^Numpad[0-9]$/.test(key)) key = "Num" + key.slice(6);
  else if (KEY_NAMES[e.key]) key = KEY_NAMES[e.key];
  else if (e.key.length === 1) key = e.key.toUpperCase();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Win");
  parts.push(key);
  return parts.join("+");
}

/** Turn user-typed text such as "ctrl + alt + z" into the canonical form. */
export function normalizeCombo(text: string): string {
  const parts = text.split("+").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === "ctrl" || l === "control") mods.add("Ctrl");
    else if (l === "alt") mods.add("Alt");
    else if (l === "shift") mods.add("Shift");
    else if (l === "win" || l === "meta" || l === "cmd") mods.add("Win");
    else key = p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
  }
  return [...["Ctrl", "Alt", "Shift", "Win"].filter(m => mods.has(m)), key].filter(Boolean).join("+");
}

const hasModifier = (combo: string) => /(^|\+)(Ctrl|Alt|Win)\+/.test(combo);
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export const Keybinds = {
  /** Register a shortcut. Returns a disposer, so plugins can call `ctx.add(Keybinds.register(...))`. */
  register(def: Omit<KeybindDef, "group"> & { group?: string }): Dispose {
    const full: KeybindDef = { group: "Mecord", ...def };
    registry.set(full.id, full);
    return () => { if (registry.get(full.id) === full) registry.delete(full.id); };
  },
  list: (): KeybindDef[] => [...registry.values()].sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
  /** Which registered shortcuts use each combo. Two or more means a conflict. */
  conflicts(): Map<string, KeybindDef[]> {
    const by = new Map<string, KeybindDef[]>();
    for (const d of registry.values()) {
      const c = effectiveCombo(d);
      if (!c) continue;
      by.set(c, [...(by.get(c) ?? []), d]);
    }
    return new Map([...by].filter(([, v]) => v.length > 1));
  },
  setCombo(id: string, combo: string) { overrides[id] = normalizeCombo(combo); saver(); },
  reset(id: string) { delete overrides[id]; saver(); },
  overrides: () => ({ ...overrides }),
};

/** Install the single capture-phase listener. Call once at boot. */
export function installKeybinds() {
  window.addEventListener("keydown", e => {
    if (e.isComposing || capturing) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    const typing = isTyping(e.target);
    for (const d of registry.values()) {
      if (effectiveCombo(d) !== combo) continue;
      if (typing && !d.allowInInput && !hasModifier(combo)) continue;
      e.preventDefault();
      e.stopPropagation();
      try { d.run(); } catch (err) { console.error("[Mecord] shortcut", d.id, err); }
      return;
    }
  }, true);
}
