// Toasts, styles/themes/quick CSS/wallpaper, slash commands, context menus, Flux subscriptions.
import { getDispatcher, getReact, find, findStore, waitForRequire } from "./webpack";
import { logger } from "./log";
import { paint } from "./tokens";
import { onAdded } from "./dom";

const log = logger("Features");
export type Dispose = () => void;

// ---------------- DOM helper ----------------
type Child = Node | string | null | undefined | false | Child[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== "list") (el as any)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  const add = (c: Child) => { if (Array.isArray(c)) c.forEach(add); else if (c !== null && c !== undefined && c !== false) el.append(c as any); };
  children.forEach(add);
  return el;
}

// ---------------- Styles ----------------
const styleRoot = () => document.head || document.documentElement;
const styleEls = new Map<string, HTMLStyleElement>();
export const Styles = {
  /** Inject or replace a stylesheet; returns a disposer. */
  set(id: string, css: string): Dispose {
    let el = styleEls.get(id);
    if (!el) { el = h("style", { "data-mecord": id }); styleEls.set(id, el); styleRoot().append(el); }
    el.textContent = css;
    return () => Styles.remove(id);
  },
  remove(id: string) { styleEls.get(id)?.remove(); styleEls.delete(id); },
  /** Keep Quick CSS the last stylesheet so it always wins over themes. */
  keepLast(id: string) {
    const el = styleEls.get(id);
    if (el && el.nextElementSibling) styleRoot().append(el);
  },
};

// ---------------- Toasts ----------------
let toastHost: HTMLElement | null = null;
export type ToastType = "info" | "success" | "warning" | "error";
export interface ToastOpts { duration?: number; action?: { label: string; run: () => void } }
const TOAST_COLORS: Record<ToastType, string> = { info: "var(--accent)", success: "#23a55a", warning: "#f0b232", error: "#f23f43" };
export const Toasts = {
  show(message: string, type: ToastType = "info", opts: ToastOpts = {}) {
    if (!toastHost) {
      toastHost = h("div", { id: "mecord-toasts" });
      document.documentElement.append(toastHost);
      Styles.set("mecord-toast-css", `
        #mecord-toasts{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:2147483000;pointer-events:none;align-items:center;font-family:var(--font,system-ui,sans-serif)}
        .mecord-toast{display:flex;align-items:center;gap:12px;background:var(--panel,#313338);color:var(--text,#dbdee1);border:1px solid var(--line,#3f4147);border-left:4px solid var(--c,#5865f2);padding:10px 14px 10px 16px;border-radius:calc(var(--mecord-radius,12px) * .6);font:500 14px/1.3 var(--font,system-ui,sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.35);animation:mtin .18s ease-out;max-width:480px;pointer-events:auto}
        .mecord-toast.out{opacity:0;transform:translateY(8px);transition:.25s}
        .mecord-toast button{all:unset;cursor:pointer;font-weight:600;color:var(--accent,#5865f2);padding:2px 6px;border-radius:6px;white-space:nowrap}
        .mecord-toast button:hover{background:color-mix(in srgb,var(--accent,#5865f2) 14%,transparent)}
        @keyframes mtin{from{opacity:0;transform:translateY(8px)}}`);
    }
    // Repaint on every show so a theme change is picked up without a reload.
    paint(toastHost, parseFloat(getComputedStyle(toastHost).getPropertyValue("--mecord-radius")) || 12);
    const t = h("div", { class: "mecord-toast", style: { "--c": TOAST_COLORS[type] } as any }, h("span", null, message));
    if (opts.action) {
      const act = opts.action;
      t.append(h("button", { onclick: () => { try { act.run(); } catch (e) { console.error("[Mecord] toast action", e); } dismiss(); } }, act.label));
    }
    toastHost.append(t);
    const dismiss = () => { t.classList.add("out"); setTimeout(() => t.remove(), 300); };
    setTimeout(dismiss, opts.duration ?? 3500);
  },
};

// ---------------- Flux ----------------
export const Flux = {
  async dispatcher() {
    await waitForRequire();
    for (let i = 0; i < 100; i++) { const d = getDispatcher(); if (d) return d; await new Promise(r => setTimeout(r, 200)); }
    throw new Error("FluxDispatcher not found");
  },
  /** Subscribe to a Flux action type; returns a disposer. */
  subscribe(type: string, fn: (e: any) => void): Dispose {
    let off = false, dispose: Dispose | null = null;
    Flux.dispatcher().then(d => {
      if (off) return;
      const wrapped = (e: any) => { try { fn(e); } catch (err) { log.error(`flux handler for ${type}`, err); } };
      d.subscribe(type, wrapped);
      dispose = () => d.unsubscribe(type, wrapped);
    }).catch(e => log.error("flux subscribe", e));
    return () => { off = true; dispose?.(); };
  },
  async dispatch(e: any) { (await Flux.dispatcher()).dispatch(e); },
  /** Intercept every dispatched action; return true to swallow it. */
  intercept(fn: (e: any) => boolean | void): Dispose {
    let off = false, dispose: Dispose | null = null;
    Flux.dispatcher().then(d => {
      if (off) return;
      const wrapped = (e: any) => { try { return fn(e) === true; } catch (err) { log.error("flux interceptor", err); return false; } };
      d.addInterceptor(wrapped);
      dispose = () => { const i = d._interceptors.indexOf(wrapped); if (i >= 0) d._interceptors.splice(i, 1); };
    }).catch(e => log.error("flux intercept", e));
    return () => { off = true; dispose?.(); };
  },
};

// ---------------- Slash commands ----------------
export interface CommandDef {
  name: string;
  description: string;
  options?: { name: string; description: string; type?: "string" | "integer" | "boolean"; required?: boolean }[];
  /** Return `{content}` to send a message, `undefined` to send nothing. */
  execute(args: Record<string, any>, ctx: { channel: any }): void | { content: string } | Promise<void | { content: string }>;
}
const commands = new Map<string, any>();
const OPT_TYPES = { string: 3, integer: 4, boolean: 5 } as const;

export const Commands = {
  register(def: CommandDef): Dispose {
    const id = `mecord-${def.name}`;
    const cmd = {
      id, untranslatedName: def.name, displayName: def.name, type: 1, inputType: 1, applicationId: "-1",
      untranslatedDescription: def.description, displayDescription: def.description,
      options: (def.options ?? []).map(o => ({
        name: o.name, displayName: o.name, type: OPT_TYPES[o.type ?? "string"], required: !!o.required,
        description: o.description, displayDescription: o.description,
      })),
      execute: async (opts: any[], ctx: any) => {
        const args: Record<string, any> = {};
        for (const o of opts ?? []) args[o.name] = o.value;
        try {
          const r = await def.execute(args, { channel: ctx?.channel });
          return r ? { content: r.content } : undefined;
        } catch (e) { log.error(`command /${def.name}`, e); Toasts.show(`/${def.name} failed: ${(e as Error).message}`, "error"); }
      },
    };
    commands.set(id, cmd);
    return () => commands.delete(id);
  },
  /** Called by the source patch on Discord's built-in command list. */
  _wrap(list: any[]) { return commands.size ? list.concat([...commands.values()]) : list; },
  all: () => [...commands.values()],
};

// ---------------- Context menus ----------------
export interface MenuItem { label: string; action: () => void; danger?: boolean; id?: string }
export interface MenuCtx { kind: "message" | "user" | "channel" | "guild" | "image" | "unknown"; target: HTMLElement; message?: any; user?: any; channel?: any; guild?: any; href?: string; src?: string; selection: string }
type MenuProvider = (ctx: MenuCtx) => MenuItem[] | undefined | void;
const menuProviders = new Set<MenuProvider>();
let lastCtx: { target: HTMLElement; sel: string } | null = null;
let menuWatch: (() => void) | null = null;

// The React fiber is an own property of the node. Object.keys skips the DOM prototype's ~340 properties that for...in walks.
function fiberOf(el: Element): any {
  for (const k of Object.keys(el)) if (k.startsWith("__reactFiber$")) return (el as any)[k];
  return null;
}
function collectProps(el: HTMLElement) {
  const out: any = {};
  let f = fiberOf(el), depth = 0;
  // Climb to the nearest ancestor with a fiber, then walk up the fiber tree.
  let node: HTMLElement | null = el;
  while (!f && node && depth++ < 10) { node = node.parentElement; if (node) f = fiberOf(node); }
  depth = 0;
  while (f && depth++ < 80) {
    const p = f.memoizedProps;
    if (p && typeof p === "object") {
      if (!out.message && p.message?.id && p.message?.channel_id) out.message = p.message;
      if (!out.channel && p.channel?.id) out.channel = p.channel;
      if (!out.user && p.user?.id && p.user?.username !== undefined) out.user = p.user;
      if (!out.guild && p.guild?.id) out.guild = p.guild;
    }
    f = f.return;
  }
  return out;
}

function classify(target: HTMLElement, props: any): MenuCtx["kind"] {
  if (target.closest("img,video")) return "image";
  if (props.message) return "message";
  if (target.closest('[class*="member"],[class*="avatar"]') && props.user) return "user";
  if (target.closest('[data-list-item-id^="channels___"]')) return "channel";
  if (target.closest('[data-list-item-id^="guildsnav___"]')) return "guild";
  return "unknown";
}

function ensureMenuObserver() {
  if (menuWatch) return;
  document.addEventListener("contextmenu", e => {
    lastCtx = { target: e.target as HTMLElement, sel: String(window.getSelection() ?? "") };
  }, true);
  menuWatch = onAdded('[role="menu"]', menu => setTimeout(() => decorateMenu(menu as HTMLElement), 0));
}

function decorateMenu(menu: HTMLElement) {
  if (menu.dataset.mecord || !lastCtx) return;
  const { target, sel } = lastCtx;
  const props = collectProps(target);
  const a = target.closest("a") as HTMLAnchorElement | null;
  const img = target.closest("img,video") as HTMLImageElement | null;
  const ctx: MenuCtx = { kind: classify(target, props), target, ...props, href: a?.href, src: img?.src, selection: sel };
  const items: MenuItem[] = [];
  for (const p of menuProviders) { try { const r = p(ctx); if (r) items.push(...r); } catch (e) { log.error("context menu provider", e); } }
  if (!items.length) return;
  menu.dataset.mecord = "1";
  // Reuse Discord's own row and separator classes, so ours get the same size, font, spacing and hover.
  // The first menu item is often an emoji tile, so take the first row that has a label instead.
  const row = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(el => el.querySelector('[class*="label_"]') && !el.className.includes("colorDanger"));
  const iconClass = row?.firstElementChild?.className ?? "";
  const labelClass = row?.querySelector('[class*="label_"]')?.className ?? "";
  const group = h("div", { role: "group" });
  for (const it of items) {
    const el = h("div", { role: "menuitem", tabIndex: -1, class: row?.className ?? "", "data-mecord-item": it.id ?? it.label,
      onclick: (ev: Event) => { ev.stopPropagation(); try { it.action(); } catch (e) { log.error("menu action", e); } document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); (document.activeElement as HTMLElement | null)?.blur?.(); document.body.click(); },
    }, h("div", { class: iconClass }), h("div", { class: labelClass, style: it.danger ? { color: "#f23f43" } : undefined }, it.label));
    group.append(el);
  }
  const scroller = menu.querySelector('[class*="scroller"]') ?? menu;
  const sep = menu.querySelector('[role="separator"]');
  if (sep) scroller.append(sep.cloneNode(false));
  scroller.append(group);
}

export const ContextMenu = {
  register(p: MenuProvider): Dispose {
    ensureMenuObserver();
    menuProviders.add(p);
    return () => menuProviders.delete(p);
  },
};

// ---------------- Stores / misc helpers ----------------
export const Stores = new Proxy({} as Record<string, any>, { get: (_, name: string) => findStore(name) });
export const Utils = {
  async copy(text: string) { try { await navigator.clipboard.writeText(text); } catch { const t = h("textarea", { value: text }); document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); } },
  sleep: (ms: number) => new Promise(r => setTimeout(r, ms)),
  debounce<T extends (...a: any[]) => void>(fn: T, ms: number) { let t: any; return ((...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }) as T; },
  React: () => getReact(),
  find,
};
