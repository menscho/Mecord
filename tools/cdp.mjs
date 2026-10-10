// Dev probe: node tools/cdp.mjs "<js expression>" | --shot out.png
import fs from "node:fs";
const dir = process.env.APPDATA + "/discord/DevToolsActivePort";
const [port, path] = fs.readFileSync(dir, "utf8").trim().split(/\r?\n/);
const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
let id = 0; const pend = new Map();
const call = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
ws.onopen = async () => {
  const t = (await call("Target.getTargets")).result.targetInfos.find(t => t.type === "page" && t.url.includes("discord.com/"));
  const { sessionId } = (await call("Target.attachToTarget", { targetId: t.targetId, flatten: true })).result;
  const a = process.argv[2];
  if (a === "--shot") {
    const r = await call("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(process.argv[3], Buffer.from(r.result.data, "base64")); console.log("saved");
  } else {
    const r = await call("Runtime.evaluate", { expression: a, awaitPromise: true, returnByValue: true }, sessionId);
    console.log(r.result.exceptionDetails ? "ERR " + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails) : JSON.stringify(r.result.result.value, null, 1));
  }
  process.exit(0);
};
