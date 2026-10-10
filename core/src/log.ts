import { notify } from "./bridge";
export function logger(name: string) {
  const fmt = (lvl: string, args: any[]) => {
    const text = args.map(a => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : safeJson(a))).join(" ");
    notify("log", { lvl, name, text });
  };
  const tag = `%c Mecord %c ${name} `;
  const css = ["background:#7c5cff;color:#fff;border-radius:4px", "background:#333;color:#ddd;border-radius:4px"];
  return {
    info: (...a: any[]) => { console.log(tag, ...css, ...a); fmt("info", a); },
    warn: (...a: any[]) => { console.warn(tag, ...css, ...a); fmt("warn", a); },
    error: (...a: any[]) => { console.error(tag, ...css, ...a); fmt("error", a); },
    debug: (...a: any[]) => { console.debug(tag, ...css, ...a); },
  };
}
function safeJson(v: any) { try { return JSON.stringify(v); } catch { return String(v); } }
export type Logger = ReturnType<typeof logger>;
