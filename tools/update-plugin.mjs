// Update (or install) one store plugin through the real UI.   node tools/update-plugin.mjs "Translator"
import { withPage } from "./lib-cdp.mjs";
const name = process.argv[2];
console.log(await withPage(ev => ev(`(async()=>{
  const r=document.querySelector('#mecord-ui'); Mecord.openSettings('plugins'); await new Promise(x=>setTimeout(x,300));
  const seg=t=>[...r.querySelectorAll('.seg button')].find(b=>b.textContent.startsWith(t));
  seg('Browse').click(); await new Promise(x=>setTimeout(x,3500));
  let row=[...r.querySelectorAll('.row')].find(c=>c.querySelector('.t b')?.textContent===${JSON.stringify(name)});
  const b=row&&[...row.querySelectorAll('button')].find(b=>b.textContent==='Update'||b.textContent==='Install'); if(b){b.click(); await new Promise(x=>setTimeout(x,2500));}
  r.querySelector('.x')?.click();
  const l=[...Mecord.plugins.loaded.values()].find(p=>p.entry.name===${JSON.stringify(name)}); return l?l.entry.version+' '+l.state:'not installed';
})()`)));
