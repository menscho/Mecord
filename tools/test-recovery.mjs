// Live test: a core that never becomes ready must be reverted to a vanilla page; repeated failures must lead to safe mode.
import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import { withPage } from "./lib-cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cfgPath = process.env.APPDATA + "/Mecord/config.json";
const log = process.env.APPDATA + "/Mecord/logs/mecord.log";
const broken = process.env.TEMP + "/broken-core.js";
fs.writeFileSync(broken, 'window.__mecordBroken = true; console.log("[broken core] never signals ready");');
const run = env => spawn("target/debug/mecord.exe", [], { env: { ...process.env, ...env }, detached: true, stdio: "ignore", windowsHide: true }).unref();
const kill = () => { try { execSync("taskkill /F /IM mecord.exe", { stdio: "ignore" }); } catch {} };
const cfg = () => JSON.parse(fs.readFileSync(cfgPath, "utf8"));

kill(); await sleep(500);
const c0 = cfg(); c0.host.bootFailures = 0; fs.writeFileSync(cfgPath, JSON.stringify(c0));
fs.writeFileSync(log, "");
run({ MECORD_CORE_OVERRIDE: broken });
await sleep(5000);
console.log("injected broken core:", await withPage(ev => ev("window.__mecordBroken===true && typeof window.Mecord==='undefined'")));
await sleep(30000);
console.log("after watchdog -> vanilla page:", await withPage(ev => ev("typeof window.__mecordBroken==='undefined' && typeof window.Mecord==='undefined' && document.readyState")));
console.log("bootFailures:", cfg().host.bootFailures);
console.log(fs.readFileSync(log, "utf8").split("\n").filter(l => /never became ready/.test(l)).map(l => l.slice(0, 120)).join("\n"));

// Safe mode after three failures
kill(); await sleep(500);
const c1 = cfg(); c1.host.bootFailures = 3; fs.writeFileSync(cfgPath, JSON.stringify(c1));
run({});
await sleep(9000);
console.log("safe mode:", JSON.stringify(await withPage(ev => ev(`({safeFlag:window.__mecordSafe,plugins:Mecord.plugins.loaded.size,patches:Mecord.webpack.patches.length,ui:!!document.querySelector('#mecord-ui'),styles:document.querySelectorAll('style[data-mecord]').length})`))));
// Leaving safe mode via the UI restores normal operation after restart.
await withPage(ev => ev(`(async()=>{const r=document.querySelector('#mecord-ui');Mecord.openSettings('diagnostics');await new Promise(x=>setTimeout(x,300));[...r.querySelectorAll('button')].find(b=>b.textContent==='Leave safe mode').click();await new Promise(x=>setTimeout(x,500))})()`));
console.log("bootFailures after leaving safe mode:", cfg().host.bootFailures);
kill(); await sleep(500);
run({});
await sleep(9000);
console.log("normal again:", JSON.stringify(await withPage(ev => ev(`({safe:window.__mecordSafe,plugins:Mecord.plugins.loaded.size})`))));
