// Live test: import a modified backup in merge then replace mode and check the persisted config.
import fs from "node:fs";
import { withPage } from "./lib-cdp.mjs";

const dir = process.env.USERPROFILE + "/Documents";
const latest = fs.readdirSync(dir).filter(f => f.startsWith("Mecord-backup-")).map(f => dir + "/" + f).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).pop();
const doc = JSON.parse(fs.readFileSync(latest, "utf8"));
doc.quickCss = ":root{--from:backup}";
doc.plugins.find(p => p.id === "calculator").enabled = false;
doc.plugins.find(p => p.id === "calculator").settings = { note: "x", apiKey: "SECRET" };
const cfgPath = process.env.APPDATA + "/Mecord/config.json";
const cfg = () => JSON.parse(fs.readFileSync(cfgPath, "utf8"));

async function importAs(mode, overwriteCss) {
  return withPage(async ev => {
    const msg = await ev(`(async()=>{
      const r=document.querySelector('#mecord-ui'); Mecord.openSettings('backup'); await new Promise(x=>setTimeout(x,300));
      const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(doc))}],'b.json'));
      r.querySelector('input[type=file]').files=dt.files; r.querySelector('select').value=${JSON.stringify(mode)};
      if(${overwriteCss}) r.querySelector('input[type=checkbox]').click();
      [...r.querySelectorAll('button')].find(b=>b.textContent==='Restore').click(); await new Promise(x=>setTimeout(x,300));
      const confirm=r.querySelector('.modal .acts .btn.danger'); if(confirm) confirm.click(); await new Promise(x=>setTimeout(x,700));
      return r.querySelector('.body').lastElementChild.textContent })()`);
    return msg;
  });
}

console.log("merge:", await importAs("merge", false));
await new Promise(r => setTimeout(r, 6000));
let c = cfg();
console.log(" quickCss kept:", c.quickCss, "| calculator.enabled:", c.plugins.calculator.enabled, "| secret leaked:", JSON.stringify(c.plugins.calculator.settings), "| other plugins still:", Object.keys(c.plugins).length);
console.log("replace:", await importAs("replace", false));
await new Promise(r => setTimeout(r, 6000));
c = cfg();
console.log(" quickCss:", c.quickCss, "| plugins in config:", Object.keys(c.plugins).length, "| themes:", c.themes.length);
console.log(" snapshots:", fs.readdirSync(process.env.APPDATA + "/Mecord/backups").filter(f => f.startsWith("pre-import")).length);
