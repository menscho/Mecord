// @name No Track
// @version 1.0.0
// @description Blocks Discord's analytics ("science"), metrics and Sentry error-report requests before they leave the app.
// @tags privacy
// @category privacy
import { definePlugin } from "@mecord/api";

const BLOCK = /\/api\/v\d+\/(science|track|metrics)(\/|\?|$)|sentry\.io|dc-telemetry\.net|\/api\/v\d+\/(users\/@me\/)?analytics/i;
let blocked = 0;
const counter = () => blocked;

export default definePlugin({
  name: "No Track",
  settings: {
    blockSentry: { type: "boolean", default: true, label: "Also block error reports (Sentry)" },
  },
  start(ctx) {
    const sentry = () => ctx.settings.get<boolean>("blockSentry");
    const isBlocked = (url: string) => BLOCK.test(url) && (sentry() || !/sentry\.io/.test(url));

    const origFetch = window.fetch;
    window.fetch = function (this: any, input: any, init?: any) {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      if (isBlocked(url)) { blocked++; return Promise.resolve(new Response(null, { status: 204 })); }
      return origFetch.call(this, input, init);
    } as typeof fetch;

    const proto = XMLHttpRequest.prototype;
    const origOpen = proto.open;
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      if (isBlocked(String(url))) { blocked++; return (origOpen as any).call(this, "GET", "data:,", ...rest); }
      return (origOpen as any).call(this, method, url, ...rest);
    } as any;

    const origBeacon = navigator.sendBeacon?.bind(navigator);
    if (origBeacon) navigator.sendBeacon = (url: string | URL, data?: any) => (isBlocked(String(url)) ? (blocked++, true) : origBeacon(url, data));

    ctx.add(() => {
      if (window.fetch !== origFetch) window.fetch = origFetch;
      proto.open = origOpen;
      if (origBeacon) navigator.sendBeacon = origBeacon;
    });
  },
  renderSettings(el) {
    const line = document.createElement("div");
    line.style.cssText = "font-size:12.5px;color:#b5bac1";
    const tick = () => (line.textContent = `Blocked ${counter()} request(s) this session.`);
    tick(); const t = setInterval(() => (el.isConnected ? tick() : clearInterval(t)), 1000);
    el.append(line);
  },
});
