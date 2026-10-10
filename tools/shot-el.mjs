// Screenshot just one element: node tools/shot-el.mjs "<css selector>" out.png   (so private chat content never gets captured)
import fs from "node:fs";
const [sel, out] = process.argv.slice(2);
const [port, path] = fs.readFileSync(process.env.APPDATA + "/discord/DevToolsActivePort", "utf8").trim().split(/\r?\n/);
const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
let id = 0; const pend = new Map();
const call = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
ws.onopen = async () => {
  const t = (await call("Target.getTargets")).result.targetInfos.find(t => t.type === "page" && t.url.includes("discord.com/"));
  const { sessionId } = (await call("Target.attachToTarget", { targetId: t.targetId, flatten: true })).result;
  const r = (await call("Runtime.evaluate", { expression: `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`, returnByValue: true }, sessionId)).result.result.value;
  if (!r) { console.log("element not found"); process.exit(1); }
  const shot = await call("Page.captureScreenshot", { format: "png", clip: { ...r, scale: 1 } }, sessionId);
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64")); console.log("saved", Math.round(r.width) + "x" + Math.round(r.height)); process.exit(0);
};
