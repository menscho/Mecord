// Live test for the Translator plugin. Never sends a message and never reads message text.
import { withPage } from "./lib-cdp.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));

await withPage(async ev => {
  // install through the real store UI
  console.log("install:", await ev(`(async()=>{
    const r=document.querySelector('#mecord-ui'); Mecord.openSettings('store'); await new Promise(x=>setTimeout(x,3500));
    const row=[...r.querySelectorAll('.row')].find(c=>c.querySelector('.t b')?.textContent==='Translator');
    const b=row&&row.querySelector('.btn.primary'); if(b&&b.textContent==='Install'){b.click(); await new Promise(x=>setTimeout(x,2500));}
    r.querySelector('.x')?.click();
    const lp=Mecord.plugins.loaded.get('translator'); return lp?lp.state+' v'+lp.entry.version:'missing';
  })()`));

  // translation pipeline via the slash command (masks mentions, links and code, then restores them)
  console.log("/tr:", JSON.stringify(await ev(`(async()=>{
    const c=Mecord.commands.all().find(c=>c.untranslatedName==='tr');
    const one=await c.execute([{name:'text',value:'Hey <@123456789>, please look at https://example.com/a?b=1 and run \`npm test\`, it is really great!'},{name:'to',value:'de'}],{});
    const two=await c.execute([{name:'text',value:'Das ist ein sehr schöner Tag heute'},{name:'to',value:'Japanese'}],{});
    const three=await c.execute([{name:'text',value:'<@123456789> https://example.com'},{name:'to',value:'de'}],{});
    return {one,two,three};
  })()`)));

  // open some channel by clicking (geometry/DOM only)
  await ev(`(async()=>{
    if(!document.querySelector('[class*=channelTextArea]')){
      const guild=[...document.querySelectorAll('[data-list-item-id^="guildsnav___"]')].find(e=>/guildsnav___[0-9]+$/.test(e.dataset.listItemId));
      guild.click(); await new Promise(r=>setTimeout(r,2500));
      const ch=[...document.querySelectorAll('[data-list-item-id^="channels___"]')].find(e=>e.tagName==='A'||e.querySelector('a'));
      (ch.tagName==='A'?ch:ch.querySelector('a')).click(); await new Promise(r=>setTimeout(r,4000));
    }
  })()`);
  await sleep(1500);
  console.log("button:", await ev(`(()=>{const b=document.querySelector('.mtr-btn');return b?{inRow:!!b.closest('[class*=buttons_]'),w:b.offsetWidth,h:b.offsetHeight,title:b.title}:null})()`));
  await ev(`document.querySelector('.mtr-btn').click()`);
  await sleep(400);
  console.log("popover:", await ev(`(()=>{const p=document.querySelector('.mtr-pop');if(!p)return null;const r=p.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,switches:p.querySelectorAll('.mtr-sw').length,selects:p.querySelectorAll('select').length}})()`));
  // switch both on for this channel, check indicator, then switch off again
  console.log("toggle:", await ev(`(async()=>{
    const p=document.querySelector('.mtr-pop'); const sw=p.querySelectorAll('.mtr-sw'); sw[0].click(); sw[1].click(); await new Promise(x=>setTimeout(x,300));
    const on=document.querySelector('.mtr-btn').dataset.on; const stored=await Mecord.plugins.loaded.get('translator').ctx.storage.get('channels',{});
    return {indicator:on,channels:Object.values(stored).map(c=>JSON.stringify(c))};
  })()`));
});
