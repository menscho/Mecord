// Prints the structure (tags, class prefixes, aria-labels; never message text) of Discord's hover toolbar, plus the colors a translation box would get.
import { withPage } from "./lib-cdp.mjs";
await withPage(async (ev, { mouse }) => {
  const id = await ev(`(()=>{const l=[...document.querySelectorAll('li[id^=chat-messages-]')];const li=l[l.length-3]||l[0];li.scrollIntoView({block:'center'});return li.id})()`);
  const p = await ev(`(()=>{const a=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:a.left+a.width*.5,y:a.top+Math.min(a.height-2,24)}})()`);
  await mouse(5, 5); await mouse(p.x, p.y); await new Promise(r => setTimeout(r, 500));
  console.log(JSON.stringify(await ev(`(()=>{
    const li=document.getElementById(${JSON.stringify(id)});
    const short=e=>e.tagName.toLowerCase()+'.'+String(e.className?.baseVal??e.className).split(' ').map(c=>c.replace(/_[a-z0-9]{5,}.*/,'')).join('.');
    const btns=[...li.querySelectorAll('[role=button][aria-label],[aria-label][class*=button]')].filter(e=>e.getBoundingClientRect().top<li.getBoundingClientRect().top+40);
    const first=btns[0], bar=first?.parentElement;
    const barChain=[];for(let e=first,i=0;e&&e!==li&&i<6;e=e.parentElement,i++)barChain.push(short(e));
    const content=li.querySelector('[id^=message-content-]');const cs=content&&getComputedStyle(content);
    const root=getComputedStyle(document.documentElement);
    return {buttons:btns.map(b=>({label:b.getAttribute('aria-label'),cls:short(b),role:b.getAttribute('role'),w:Math.round(b.getBoundingClientRect().width),inner:b.firstElementChild&&short(b.firstElementChild)})),chain:barChain,
      barChildren:bar&&[...bar.children].map(short),barRect:bar&&(r=>[r.left,r.top,r.width,r.height].map(Math.round))(bar.getBoundingClientRect()),
      contentColor:cs&&cs.color,textDefault:root.getPropertyValue('--text-default').trim(),brand:root.getPropertyValue('--background-brand').trim(),bg:getComputedStyle(li).backgroundColor}
  })()`)));
});
