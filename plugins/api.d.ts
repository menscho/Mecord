declare module "@mecord/api" {
  export type Dispose = () => void;
  export interface MenuItem { label: string; action: () => void; danger?: boolean; id?: string }
  export interface MenuCtx { kind: "message" | "user" | "channel" | "guild" | "image" | "unknown"; target: HTMLElement; message?: any; user?: any; channel?: any; guild?: any; href?: string; src?: string; selection: string }
  export type SettingDef =
    | { type: "boolean"; default: boolean; label: string; description?: string }
    | { type: "string"; default: string; label: string; description?: string; secret?: boolean; placeholder?: string }
    | { type: "number"; default: number; label: string; description?: string; min?: number; max?: number }
    | { type: "select"; default: string; label: string; description?: string; options: { label: string; value: string }[] };
  export interface PluginCtx {
    id: string;
    log: { info(...a: any[]): void; warn(...a: any[]): void; error(...a: any[]): void; debug(...a: any[]): void };
    settings: { get<T = any>(k: string): T; set(k: string, v: any): void; all(): Record<string, any>; onChange(fn: (k: string, v: any) => void): Dispose };
    add(d: Dispose): void;
    net: { fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; text: string; json(): any }> };
    native: { call<T = any>(method: string, args?: any): Promise<T> };
    storage: { get<T = any>(k: string, d?: T): Promise<T>; set(k: string, v: any): Promise<void> };
    /** Page changes come from one shared observer. Subscriptions end when the plugin stops. Prefer these to observing document.body yourself. */
    dom: {
      /** Called with the changed parts of the page after each batch of changes. Scan the roots, not document. */
      onBatch(fn: (roots: Element[]) => void): Dispose;
      /** Calls fn for each element matching `selector`, now and whenever one appears. */
      watch(selector: string, fn: (el: Element) => void): Dispose;
      /** Elements matching `selector` inside the roots (a root itself counts). */
      within(roots: Element[], selector: string): Element[];
    };
    /** A timer that stops with the plugin. `pauseWhenHidden` skips ticks while Discord is minimised or hidden. */
    every(ms: number, fn: () => void, opts?: { pauseWhenHidden?: boolean }): Dispose;
  }
  export interface PatchDef { find: string | RegExp; replacement: { match: string | RegExp; replace: string | ((m: string, ...g: any[]) => string) } | { match: string | RegExp; replace: string | ((m: string, ...g: any[]) => string) }[]; predicate?: () => boolean; label?: string }
  export interface CommandDef { name: string; description: string; options?: { name: string; description: string; type?: "string" | "integer" | "boolean"; required?: boolean }[]; execute(args: Record<string, any>, ctx: { channel: any }): void | { content: string } | Promise<void | { content: string }> }
  export interface PluginDef {
    name?: string; description?: string; settings?: Record<string, SettingDef>; patches?: PatchDef[]; commands?: CommandDef[];
    flux?: Record<string, (e: any) => void>; styles?: string; contextMenu?: (ctx: MenuCtx) => MenuItem[] | void;
    start?(ctx: PluginCtx): void | Promise<void>; stop?(ctx: PluginCtx): void; renderSettings?(el: HTMLElement, ctx: PluginCtx): void; [k: string]: any;
  }
  export function definePlugin<T extends PluginDef>(d: T): T;
  export const Toasts: { show(message: string, type?: "info" | "success" | "warning" | "error", opts?: { duration?: number; action?: { label: string; run: () => void } }): void };
  export const Flux: { subscribe(type: string, fn: (e: any) => void): Dispose; dispatch(e: any): Promise<void>; intercept(fn: (e: any) => boolean | void): Dispose; dispatcher(): Promise<any> };
  export const Commands: { register(def: CommandDef): Dispose };
  /** Shortcuts show on the Shortcuts page and can be rebound there. `combo` is the default, e.g. "Ctrl+Alt+M". Return the disposer to `ctx.add` it. */
  export const Keybinds: {
    register(def: { id: string; label: string; group?: string; combo: string; run(): void; allowInInput?: boolean }): Dispose;
    list(): { id: string; label: string; group: string; combo: string }[];
    conflicts(): Map<string, { id: string; label: string }[]>;
    setCombo(id: string, combo: string): void;
    reset(id: string): void;
    overrides(): Record<string, string>;
  };
  export const ContextMenu: { register(p: (ctx: MenuCtx) => MenuItem[] | void): Dispose };
  export const Styles: { set(id: string, css: string): Dispose; remove(id: string): void };
  export const Stores: Record<string, any>;
  export const Utils: { copy(t: string): Promise<void>; sleep(ms: number): Promise<void>; debounce<T extends (...a: any[]) => void>(f: T, ms: number): T; find(f: (e: any) => boolean): any };
  export const Webpack: { find(f: (e: any, id: string) => boolean): any; findByProps(...p: string[]): any; findByCode(...c: string[]): any; findStore(n: string): any; wreq: any };
  export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: any[]): HTMLElementTagNameMap[K];
  export const React: any;
}
