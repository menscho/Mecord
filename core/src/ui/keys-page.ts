// Shortcuts page: every registered shortcut, with rebinding (press the keys you want), reset, clear and conflict warnings.
import { h, Toasts } from "../features";
import { Keybinds, KeybindDef, comboFromEvent, effectiveCombo, setCapturing } from "../keybinds";
import { S, hooks, Mount, btn, pill, seg, modal } from "./shell";

/** Show a combo as separate keycaps: Ctrl + Alt + Z. */
export function keycaps(combo: string) {
  if (!combo) return h("span", { class: "lab" }, "Not set");
  const parts = combo.split("+");
  return h("span", { class: "kc" }, ...parts.flatMap((p, i) => (i ? [h("em", null, "+"), h("span", null, p)] : [h("span", null, p)])));
}

/** Wait for the next key combination. Escape cancels, Backspace or Delete clears the shortcut. */
function record(def: KeybindDef, done: () => void) {
  setCapturing(true);
  const finish = () => { window.removeEventListener("keydown", onKey, true); setCapturing(false); done(); };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") return finish();
    if (e.key === "Backspace" || e.key === "Delete") { Keybinds.setCombo(def.id, ""); return finish(); }
    const combo = comboFromEvent(e);
    if (!combo) return; // a lone modifier: keep waiting
    Keybinds.setCombo(def.id, combo);
    finish();
  };
  window.addEventListener("keydown", onKey, true);
}

export const mountKeys: Mount = (tools, head, body) => {
  const groups = [...new Set(Keybinds.list().map(d => d.group))];
  head.append(btn("Reset all", async () => {
    if (!Object.keys(Keybinds.overrides()).length) { Toasts.show("Nothing has been changed", "info", { duration: 1800 }); return; }
    if (!(await modal("Reset every shortcut?", [h("p", null, "Each shortcut goes back to its default key.")], "Reset", true))) return;
    for (const id of Object.keys(Keybinds.overrides())) Keybinds.reset(id);
    hooks.refresh();
  }, "ghost", "refresh"));
  tools.append(seg([["all", "All"], ...groups.map(g => [g, g] as [string, string])], S.sub.keys, id => { S.sub.keys = id; hooks.render(); }));

  const build = () => {
    body.replaceChildren();
    const conflicts = Keybinds.conflicts();
    if (conflicts.size) {
      const lines = [...conflicts].map(([combo, defs]) => `${combo} is used by ${defs.map(d => `${d.label} (${d.group})`).join(" and ")}`);
      body.append(h("div", { class: "note warn" }, h("div", { class: "grow" }, h("b", null, "Some keys clash"), h("div", { style: { color: "var(--muted)" } }, ...lines.map(l => h("div", null, l))))));
    }
    body.append(h("div", { class: "note" }, h("div", { class: "grow" },
      "Shortcuts from a plugin only work while that plugin is on. Shortcuts with Ctrl, Alt or Win also work while you're typing.")));
    const sub = S.sub.keys;
    const all = Keybinds.list().filter(d => sub === "all" || d.group === sub);
    if (!all.length) { body.append(h("div", { class: "empty" }, h("b", null, "No shortcuts here"), "Turn on a plugin that has one, and it shows up here.")); return; }
    for (const g of groups) {
      const defs = all.filter(d => d.group === g);
      if (!defs.length) continue;
      body.append(h("div", { class: "grouphead" }, h("h2", null, g), h("span", null, `${defs.length} shortcut${defs.length === 1 ? "" : "s"}`)));
      for (const d of defs) body.append(row(d));
    }
  };
  build();
  return () => build();
};

function row(d: KeybindDef) {
  const combo = effectiveCombo(d);
  const changed = d.id in Keybinds.overrides();
  const conflict = Keybinds.conflicts().get(combo);
  const change = btn("Change", () => {
    S.recording = d.id;
    hooks.refresh();
    record(d, () => { S.recording = null; hooks.refresh(); });
  }, "primary");
  const recording = S.recording === d.id;
  return h("div", { class: "row nosw" },
    h("div", { class: "main" },
      h("div", { class: "t" }, h("b", null, d.label), changed && pill("Changed", "acc"), conflict && pill("Clash", "warn")),
      h("div", { class: "d" }, d.id)),
    h("div", { class: "a", style: { gap: "10px" } },
      recording ? h("span", { class: "rec" }, "Press keys…") : keycaps(combo),
      change,
      changed && btn("Reset", () => { Keybinds.reset(d.id); hooks.refresh(); }, "ghost"),
      combo && btn("Clear", () => { Keybinds.setCombo(d.id, ""); hooks.refresh(); }, "ghost")));
}
