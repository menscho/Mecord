// Quick CSS editor: syntax colours, plus autocomplete for CSS properties and Discord's colour variables.
import { h } from "./features";
import { PALETTE_VARS } from "./builtin-themes";
import { escapeHooks } from "./keybinds";

const PROPS = [
  "align-items", "animation", "background", "background-color", "background-image", "backdrop-filter", "border", "border-color",
  "border-radius", "bottom", "box-shadow", "box-sizing", "color", "column-gap", "cursor", "display", "filter", "flex", "flex-direction",
  "font", "font-family", "font-size", "font-weight", "gap", "grid-template-columns", "height", "inset", "justify-content", "left",
  "letter-spacing", "line-height", "margin", "margin-top", "margin-bottom", "max-height", "max-width", "min-height", "min-width", "object-fit",
  "opacity", "outline", "overflow", "padding", "padding-top", "padding-bottom", "pointer-events", "position", "right", "text-align",
  "text-decoration", "text-overflow", "text-shadow", "top", "transform", "transition", "transition-duration", "visibility", "white-space",
  "width", "word-break", "z-index", "backdrop-filter", "mix-blend-mode", "scrollbar-width", "scrollbar-color",
];
const POOL = [...PROPS, ...PALETTE_VARS];

const TOKEN = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|@[\w-]+|--[\w-]+|#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:%|[a-zA-Z]{1,4})?(?![\w-])|[\w-]+(?=\s*:)|[{}();,:>+~[\]=*]/g;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML with coloured spans for CSS source. Exported for tests and for the palette preview. */
export function highlightCss(src: string): string {
  let out = "", last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const t = m[0], i = m.index ?? 0;
    out += esc(src.slice(last, i));
    last = i + t.length;
    let cls = "";
    if (t.startsWith("/*")) cls = "com";
    else if (t[0] === `"` || t[0] === "'") cls = "str";
    else if (t[0] === "@") cls = "at";
    else if (t.startsWith("--")) cls = "var";
    else if (t[0] === "#" || /^-?[\d.]/.test(t)) cls = "num";
    else if (/^[\w-]+$/.test(t)) cls = "prop";
    else cls = "punc";
    out += `<span class="t-${cls}">${esc(t)}</span>`;
  }
  return out + esc(src.slice(last));
}

// One editor may be open at a time; the shared Escape hook closes its popup first.
let closeActive: (() => boolean) | null = null;
escapeHooks.push(() => (closeActive ? closeActive() : false));

/** A code editor: a highlighted layer under a transparent textarea, with autocomplete below the caret line. */
export function cssEditor(initial: string, onInput: (v: string) => void, placeholder = ""): HTMLElement {
  const hl = h("pre", { class: "cm-hl", "aria-hidden": "true" });
  const ta = h("textarea", { class: "cm-in", spellcheck: false, placeholder, "aria-label": "Quick CSS", value: initial }) as HTMLTextAreaElement;
  const pop = h("div", { class: "cm-ac", role: "listbox", hidden: true });
  let items: string[] = [], sel = 0;

  const paint = () => { hl.innerHTML = highlightCss(ta.value) + "\n"; };
  const close = (): boolean => {
    if (pop.hidden) return false;
    pop.hidden = true; pop.replaceChildren(); items = [];
    return true;
  };
  const renderPop = () => {
    pop.replaceChildren(...items.map((it, i) => h("button", {
      class: i === sel ? "on" : "", role: "option", "aria-selected": String(i === sel),
      onmousedown: (e: Event) => { e.preventDefault(); accept(i); },
    }, it)));
    pop.hidden = items.length === 0;
  };
  const suggest = () => {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = /[\w-]{2,}$/.exec(before);
    if (!m) { close(); return; }
    const word = m[0];
    items = POOL.filter(p => p.startsWith(word) && p !== word).slice(0, 8);
    sel = 0;
    renderPop();
  };
  const accept = (i: number) => {
    const it = items[i];
    if (!it) return;
    const end = ta.selectionStart, v = ta.value;
    const start = end - (/[\w-]+$/.exec(v.slice(0, end))?.[0].length ?? 0);
    const insert = it.startsWith("--") ? it : it + ": ";
    ta.value = v.slice(0, start) + insert + v.slice(end);
    ta.selectionStart = ta.selectionEnd = start + insert.length;
    close(); paint(); onInput(ta.value);
  };

  ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
  ta.addEventListener("input", () => { paint(); onInput(ta.value); suggest(); });
  ta.addEventListener("click", () => close());
  ta.addEventListener("blur", () => close());
  ta.addEventListener("keydown", e => {
    if (pop.hidden) {
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; paint(); onInput(ta.value); }
      return;
    }
    if (e.key === "ArrowDown") { sel = (sel + 1) % items.length; renderPop(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = (sel - 1 + items.length) % items.length; renderPop(); e.preventDefault(); }
    else if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); accept(sel); }
    else if (e.key === "Escape") { close(); e.preventDefault(); }
  });
  closeActive = close;
  paint();
  return h("div", { class: "cm" }, hl, ta, pop);
}
