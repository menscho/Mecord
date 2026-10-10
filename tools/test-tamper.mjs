// Live test of the store's trust chain: a modified plugin file and a modified index must both be refused.
import fs from "node:fs";
import { withPage } from "./lib-cdp.mjs";

const file = "store/plugins/zen-mode/1.0.0/index.js";
const idx = "store/index.json";
const origFile = fs.readFileSync(file), origIdx = fs.readFileSync(idx);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function installAttempt() {
  return withPage(ev => ev(`(async()=>{
    const r=document.querySelector('#mecord-ui'); Mecord.openSettings('store'); await new Promise(x=>setTimeout(x,3500));
    const err=r.querySelector('.note.bad .err')?.textContent; if(err) return {indexError:err};
    const seg=t=>[...r.querySelectorAll('.seg button')].find(b=>b.textContent.startsWith(t));
    const row=()=>[...r.querySelectorAll('.row')].find(c=>c.querySelector('.t b')?.textContent==='Zen Mode');
    seg('Installed').click(); await new Promise(x=>setTimeout(x,300));
    const un=row()&&[...row().querySelectorAll('button')].find(b=>b.textContent==='Remove');
    if(un){un.click(); await new Promise(x=>setTimeout(x,300)); r.querySelector('.modal .acts .btn.danger').click(); await new Promise(x=>setTimeout(x,1500));}
    seg('Browse').click(); await new Promise(x=>setTimeout(x,3500));
    const b=[...row().querySelectorAll('button')].find(b=>b.textContent==='Install'||b.textContent==='Update'); b.click(); await new Promise(x=>setTimeout(x,2500));
    const toast=[...document.querySelectorAll('.mecord-toast')].map(t=>t.textContent).pop();
    return {installed:Mecord.plugins.loaded.has('zen-mode'),toast};
  })()`));
}

try {
  fs.writeFileSync(file, Buffer.concat([origFile, Buffer.from("//x")]));
  console.log("tampered file  ->", JSON.stringify(await installAttempt()));
  fs.writeFileSync(file, origFile);
  const j = JSON.parse(origIdx.toString()); j.plugins[0].description = "hacked";
  fs.writeFileSync(idx, JSON.stringify(j));
  console.log("tampered index ->", JSON.stringify(await installAttempt()));
} finally {
  fs.writeFileSync(file, origFile); fs.writeFileSync(idx, origIdx);
}
console.log("restored       ->", JSON.stringify(await installAttempt()));
