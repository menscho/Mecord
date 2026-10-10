// The gray M in Discord's title bar, left of Inbox and Help. It cloning Discord's own inbox button keeps its spacing and hover style.
import { h } from "../features";
import { Keybinds, effectiveCombo } from "../keybinds";
import { onBatch } from "../dom";

let wrap: HTMLElement | null = null;
let dot: HTMLElement | null = null;
let placed = false;
let place: () => void = () => {};

/** Whether the M button currently sits in the title bar (Health reports this). */
export const titlePlaced = () => placed;
export const setTitleDot = (on: boolean) => { if (dot) dot.style.display = on ? "block" : "none"; };

export function mountTitleButton(opts: { enabled: () => boolean; open: () => boolean; toggle: () => void }) {
  const idle = "var(--interactive-icon-default,var(--interactive-normal,#b5bac1))", hot = "var(--interactive-icon-hover,var(--interactive-hover,#fff))";
  const combo = () => {
    const d = Keybinds.list().find(k => k.id === "mecord.toggle");
    return d && effectiveCombo(d) ? ` (${effectiveCombo(d)})` : "";
  };
  place = () => {
    if (!opts.enabled()) { wrap?.remove(); wrap = null; placed = false; return; }
    if (wrap?.isConnected) { placed = true; return; }
    const inbox = document.querySelector('[class*="trailing_"] [class*="iconWrapper_"]') as HTMLElement | null;
    const trailing = inbox?.parentElement;
    if (!inbox || !trailing) { placed = false; return; }
    const w = inbox.cloneNode(true) as HTMLElement; // listeners are not cloned, so only the markup comes across
    const clickable = (w.querySelector('[class*="clickable_"]') ?? w.firstElementChild) as HTMLElement;
    clickable.removeAttribute("aria-label"); clickable.removeAttribute("title");
    clickable.setAttribute("aria-label", "Mecord"); clickable.setAttribute("title", "Mecord" + combo());
    clickable.setAttribute("role", "button"); clickable.setAttribute("tabindex", "0");
    clickable.replaceChildren();
    clickable.style.position = "relative";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "24"); svg.setAttribute("height", "24"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.1"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = '<path d="M5.5 18.5V6l6.5 8.2L18.5 6v12.5"/>'; // static markup
    const tint = () => { svg.style.color = opts.open() ? hot : idle; };
    svg.style.cssText = "display:block";
    tint();
    clickable.append(svg);
    dot = h("span", { class: "mecord-dot", style: { position: "absolute", top: "3px", right: "3px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--accent,#7aa7ff)", display: "none", pointerEvents: "none" } });
    clickable.append(dot);
    clickable.addEventListener("mouseenter", () => (svg.style.color = hot));
    clickable.addEventListener("mouseleave", tint);
    clickable.addEventListener("click", e => { e.stopPropagation(); opts.toggle(); });
    clickable.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.toggle(); } });
    trailing.insertBefore(w, inbox);
    wrap = w; placed = true;
    tintRefresh = tint;
  };
  place();
  onBatch(() => place());
}
let tintRefresh: () => void = () => {};
/** Re-tint the button after the window opens or closes. */
export const tintTitleButton = () => tintRefresh();
/** Try to place the button again (after a setting change or a failed first try). */
export const refreshTitleButton = () => place();
