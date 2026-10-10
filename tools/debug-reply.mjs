// Why does a reply message get (or not get) the toolbar button? Booleans/ids only.
import { withPage } from "./lib-cdp.mjs";
await withPage(async (ev, { mouse }) => {
  const id = await ev(`(()=>{for(const li of [...document.querySelectorAll('li[id^=chat-messages-]')].reverse()){if(li.querySelector('[class*=repliedMessage]')&&li.querySelector('[id^=message-content-]')){li.scrollIntoView({block:'center'});return li.id}}return null})()`);
  if (!id) { console.log("no reply in view"); return; }
  const p = await ev(`(()=>{const a=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:a.left+a.width*.5,y:a.top+Math.min(a.height-2,22)}})()`);
  await mouse(5, 5); await new Promise(r => setTimeout(r, 400)); await mouse(p.x, p.y); await new Promise(r => setTimeout(r, 1200));
  console.log(JSON.stringify(await ev(`(()=>{
    const li=document.getElementById(${JSON.stringify(id)});const myId=li.id.split('-').pop();
    let f=null;for(let n=li,i=0;n&&i<8&&!f;n=n.parentElement,i++)for(const k in n)if(k.startsWith('__reactFiber$')){f=n[k];break}
    const chain=[];for(let i=0;f&&i<40;f=f.return,i++){const m=f.memoizedProps?.message;if(m&&m.id)chain.push({depth:i,sameId:m.id===myId,contentType:typeof m.content,hasText:!!(m.content&&m.content.trim()),type:m.type,hasRef:!!m.messageReference||!!m.message_reference})}
    const contents=[...li.querySelectorAll('[id^=message-content-]')].map(e=>e.id.replace(/\\d{6,}/g,m=>m===myId?'<mine>':'<other>'));
    const inner=li.querySelector('[role=group][class*=buttons_] [class*=buttonsInner_]');
    return {chain:chain.slice(0,3),contents,innerExists:!!inner,tr:li.querySelectorAll('.mtr-tb').length,mtrBoxes:li.querySelectorAll('.mtr-box').length}})()`)));
});
