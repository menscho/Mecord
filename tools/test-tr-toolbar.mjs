// Live test: Translate button in the message hover toolbar + readable translation colors. Reads only structure/colors, never message text.
import { withPage } from "./lib-cdp.mjs";
const wantReply = process.argv.includes('--reply');
const sleep = ms => new Promise(r => setTimeout(r, ms));

await withPage(async (ev, { mouse }) => {
  console.log("plugin:", await ev(`(()=>{const l=Mecord.plugins.loaded.get('translator');return l?l.entry.version+' '+l.state:'missing'})()`));
  // find a message that has text content, via React props (booleans only)
  const findTarget = () => ev(`(()=>{
    for(const li of [...document.querySelectorAll('li[id^=chat-messages-]')].reverse()){
      let f=null;for(let n=li.querySelector('[id^=message-content-]')||li,i=0;n&&i<8&&!f;n=n.parentElement,i++)for(const k in n)if(k.startsWith('__reactFiber$')){f=n[k];break}
      for(let i=0;f&&i<60;f=f.return,i++){const m=f.memoizedProps?.message;if(m&&m.id&&typeof m.content==='string'&&m.content.trim().length>12&&li.querySelector('[id^=message-content-]')&&(!${wantReply}||li.querySelector('[class*=repliedMessage]'))){li.scrollIntoView({block:'center'});return li.id}}
    } return null})()`);
  let target = await findTarget();
  // The open channel may only have bot embeds: walk the channel list (clicks only) until one has a text message.
  const guildCount = await ev(`[...document.querySelectorAll('[data-list-item-id^="guildsnav___"]')].filter(e=>/guildsnav___[0-9]+$/.test(e.dataset.listItemId)).length`);
  outer: for (let g = 0; g < Math.min(guildCount, 10); g++) {
    await ev(`(async()=>{[...document.querySelectorAll('[data-list-item-id^="guildsnav___"]')].filter(e=>/guildsnav___[0-9]+$/.test(e.dataset.listItemId))[${g}].click();await new Promise(r=>setTimeout(r,2500))})()`);
    for (let i = 0; i < 6; i++) {
      await ev(`(async()=>{const l=[...document.querySelectorAll('[data-list-item-id^=channels___] a, a[data-list-item-id^=channels___]')][${i}];if(l){l.click();await new Promise(r=>setTimeout(r,2500))}})()`);
      target = await findTarget();
      if (target) break outer;
    }
  }
  if (!target) { console.log("no message with text in view"); return; }
  await sleep(300);
  const p = await ev(`(()=>{const a=document.getElementById(${JSON.stringify(target)}).getBoundingClientRect();return {x:a.left+a.width*.5,y:a.top+Math.min(a.height-2,22)}})()`);
  await mouse(5, 5); await mouse(p.x, p.y); await sleep(700);
  console.log("toolbar:", JSON.stringify(await ev(`(()=>{
    const li=document.getElementById(${JSON.stringify(target)});const bar=li.querySelector('[role=group][class*=buttons_] [class*=buttonsInner_]');
    if(!bar)return 'no toolbar';const kids=[...bar.children].map(c=>c.classList.contains('mtr-tb')?'[TRANSLATE]':(c.getAttribute('aria-label')||'?').slice(0,18));
    const b=bar.querySelector('.mtr-tb');const r=b&&b.getBoundingClientRect();const sib=bar.querySelector('[role=button]:not(.mtr-tb)').getBoundingClientRect();
    return {order:kids,size:r&&[Math.round(r.width),Math.round(r.height)],siblingSize:[Math.round(sib.width),Math.round(sib.height)],sameRow:r&&Math.abs(r.top-sib.top)<2,svgVisible:!!b?.querySelector('svg')&&b.querySelector('svg').getBoundingClientRect().width>0}})()`)));
  // Force a translation to happen: temporarily make my language Japanese (restored below).
  const prevMine = await ev(`(()=>{const c=Mecord.plugins.loaded.get('translator').ctx.settings;const v=c.get('mine');c.set('mine','ja');return v})()`);
  // click it with the real mouse and check the box + contrast
  const bpos = await ev(`(()=>{const b=document.getElementById(${JSON.stringify(target)}).querySelector('.mtr-tb');if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!bpos) { console.log("button not found"); return; }
  await mouse(bpos.x, bpos.y); await sleep(300);
  // The message may already be in the chosen language (then Translator correctly shows nothing), so try a few.
  for (const lang of ["ja", "de", "ru", "fr"]) {
    await ev(`Mecord.plugins.loaded.get('translator').ctx.settings.set('mine',${JSON.stringify(lang)})`);
    await ev(`document.getElementById(${JSON.stringify(target)}).querySelector('.mtr-tb').click()`);
    await sleep(3500);
    const shown = await ev(`!!document.getElementById(${JSON.stringify(target)}).querySelector('.mtr-box')`);
    if (shown) { console.log("translated into", lang); break; }
  }
  console.log("box:", JSON.stringify(await ev(`(()=>{
    const li=document.getElementById(${JSON.stringify(target)});const box=li.querySelector('.mtr-box');if(!box)return 'no box';
    const cv=document.createElement('canvas');cv.width=cv.height=1;const g=cv.getContext('2d',{willReadFrequently:true});
    const rgba=s=>{g.clearRect(0,0,1,1);g.fillStyle='#000';g.fillStyle=s;g.fillRect(0,0,1,1);const d=g.getImageData(0,0,1,1).data;return [d[0],d[1],d[2],d[3]/255]};
    const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
    const fg=rgba(getComputedStyle(box).color);let bg=[30,31,34],n=box;for(;n;n=n.parentElement){const c=rgba(getComputedStyle(n).backgroundColor);if(c[3]>.5){bg=c;break}}
    const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
    const btn=li.querySelector('.mtr-tb');
    const own=li.querySelector('[id="message-content-'+li.id.split('-').pop()+'"]');const preview=li.querySelector('[class*=repliedMessage]');const br=box.getBoundingClientRect(),lr=li.getBoundingClientRect(),or=own.getBoundingClientRect();
    const geo={afterOwnText:own.nextElementSibling===box,insidePreview:!!(preview&&preview.contains(box)),insideRow:br.top>=lr.top&&br.bottom<=lr.bottom+1,h:Math.round(br.height),below:br.top>=or.bottom-2,hasReplyPreview:!!preview};
    return {geo,state:box.firstChild.textContent.slice(0,0)+'present',err:box.classList.contains('err'),fg:getComputedStyle(box).color,bg:'rgb('+bg.slice(0,3).join(',')+')',contrast:Math.round(ratio*10)/10,btnOpen:btn&&btn.dataset.open}})()`)));
  // toggle off again
  await ev(`document.getElementById(${JSON.stringify(target)}).querySelector('.mtr-tb')?.click()`);
  await sleep(300);
  await ev(`Mecord.plugins.loaded.get('translator').ctx.settings.set('mine',${JSON.stringify('PREV')})`.replace('"PREV"', JSON.stringify(prevMine)));
  console.log("closed again:", await ev(`!document.getElementById(${JSON.stringify(target)}).querySelector('.mtr-box')`));
});
