// Tiny CDP helper for tests: `await withPage(async ev => { await ev("1+1") })`.
import fs from "node:fs";

export async function withPage(fn) {
  const [port, path] = fs.readFileSync(process.env.APPDATA + "/discord/DevToolsActivePort", "utf8").trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const call = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const t = (await call("Target.getTargets")).result.targetInfos.find(t => t.type === "page" && t.url.includes("discord.com/"));
  const { sessionId } = (await call("Target.attachToTarget", { targetId: t.targetId, flatten: true })).result;
  const ev = async expression => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval error");
    return r.result.result.value;
  };
  const mouse = (x, y) => call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, sessionId);
  try { return await fn(ev, { mouse }); } finally { ws.close(); }
}
