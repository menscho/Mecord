// Page <-> host RPC over the CDP Runtime binding.
type Pending = { res: (v: any) => void; rej: (e: Error) => void };
const pending = new Map<number, Pending>();
const listeners = new Map<string, Set<(d: any) => void>>();
let seq = 0;

declare global {
  interface Window { __mecordBinding?: (s: string) => void; __mecord_rx?: (m: any) => void; __mecordSafe?: boolean }
}

export function call<T = any>(op: string, args: any = {}): Promise<T> {
  return new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    try { window.__mecordBinding!(JSON.stringify({ id, op, args })); }
    catch (e) { pending.delete(id); rej(new Error("host bridge unavailable")); }
  });
}

/** Fire-and-forget. */
export function notify(op: string, args: any = {}) {
  try { window.__mecordBinding!(JSON.stringify({ id: 0, op, args })); } catch {}
}

export function onHost(event: string, fn: (d: any) => void) {
  let s = listeners.get(event);
  if (!s) listeners.set(event, (s = new Set()));
  s.add(fn);
  return () => s!.delete(fn);
}

window.__mecord_rx = (m: any) => {
  if (m.event) { listeners.get(m.event)?.forEach(f => { try { f(m.data); } catch (e) { console.error("[Mecord] host event handler", e); } }); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.ok ? p.res(m.result) : p.rej(new Error(m.error || "host error"));
};
