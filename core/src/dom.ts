// One MutationObserver for the whole page. Plugins and core modules subscribe here instead of observing document.body
// themselves: each batch of changes is delivered once, as the elements that changed, so a subscriber scans those parts
// of the page rather than querying all of it.
import { logger } from "./log";

const log = logger("DOM");
type Dispose = () => void;
export type Batch = (roots: Element[]) => void;

const subs = new Set<Batch>();
const pending = new Set<Element>();
let observer: MutationObserver | null = null;
let flushQueued = false;

function start() {
  if (observer) return;
  if (!document.body) { document.addEventListener("DOMContentLoaded", start, { once: true }); return; }
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type !== "childList") continue;
      // The parent whose children changed (e.g. a text node was replaced) and every element that was added.
      if (r.target instanceof Element) pending.add(r.target);
      for (const n of r.addedNodes) if (n instanceof Element) pending.add(n);
    }
    if (pending.size && !flushQueued) { flushQueued = true; setTimeout(flush, 0); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function flush() {
  flushQueued = false;
  const set = new Set([...pending].filter(el => el.isConnected));
  pending.clear();
  // Drop roots that sit inside another root, so nothing is scanned twice.
  const roots = [...set].filter(el => { for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
  if (!roots.length) return;
  for (const fn of [...subs]) {
    try { fn(roots); } catch (e) { log.error("DOM subscriber failed", e); }
  }
}

/** Runs `fn` with the changed roots after each batch of page changes. Returns the disposer. */
export function onBatch(fn: Batch): Dispose {
  subs.add(fn);
  start();
  return () => {
    subs.delete(fn);
    if (!subs.size) { observer?.disconnect(); observer = null; pending.clear(); }
  };
}

/** Elements matching `selector` within the roots (a root itself counts). */
export function within(roots: Element[], selector: string): Element[] {
  const out: Element[] = [];
  for (const r of roots) {
    if (r.matches(selector)) out.push(r);
    out.push(...r.querySelectorAll(selector));
  }
  return out;
}

/** Calls `fn` for every element matching `selector` that is added later. */
export function onAdded(selector: string, fn: (el: Element) => void): Dispose {
  return onBatch(roots => {
    for (const el of within(roots, selector)) {
      try { fn(el); } catch (e) { log.error(`DOM watcher ${selector} failed`, e); }
    }
  });
}

/** Like onAdded, but also calls `fn` for the matches already on the page. */
export function watch(selector: string, fn: (el: Element) => void): Dispose {
  const off = onAdded(selector, fn);
  if (document.body) for (const el of within([document.body], selector)) {
    try { fn(el); } catch (e) { log.error(`DOM watcher ${selector} failed`, e); }
  }
  return off;
}
