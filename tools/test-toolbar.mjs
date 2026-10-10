// Layout bisect: measures where each message's hover toolbar sits (geometry only, never message text),
// then stops each running plugin in memory (config untouched) and re-measures the same messages.
//   node tools/test-toolbar.mjs
import { withPage } from "./lib-cdp.mjs";

await withPage(async (ev, { mouse }) => {
  const ids = await ev(`(()=>[...document.querySelectorAll('li[id^=chat-messages-]')].slice(-16).map(l=>l.id))()`);

  async function measure() {
    const out = {};
    for (const id of ids) {
      const p = await ev(`(()=>{const li=document.getElementById(${JSON.stringify(id)});if(!li)return null;li.scrollIntoView({block:'center'});const a=li.getBoundingClientRect();return {x:a.left+a.width*0.5,y:a.top+Math.min(a.height-2,24)}})()`);
      if (!p) continue;
      await mouse(5, 5); await mouse(p.x, p.y); await new Promise(x => setTimeout(x, 300));
      out[id] = await ev(`(()=>{const li=document.getElementById(${JSON.stringify(id)});const a=li.getBoundingClientRect();
        const tb=[...li.querySelectorAll('[class*=buttons_],[class*=buttonContainer],[class*=toolbar]')].find(e=>e.querySelector('[role=button],button,[aria-label]')&&e.getBoundingClientRect().width>0);
        if(!tb) return null; const t=tb.getBoundingClientRect();
        const rep=li.querySelector('[class*=repliedMessage]'); const hdr=li.querySelector('h3,[class*=header_]');
        return {reply:!!rep,top:Math.round(t.top-a.top),hdrTop:hdr?Math.round(hdr.getBoundingClientRect().top-a.top):null,h:Math.round(a.height)}})()`);
    }
    return out;
  }
  const summarize = m => { const v = Object.values(m).filter(Boolean); return { n: v.length, tops: [...new Set(v.map(x => x.top))].sort((a, b) => a - b).join(","), replyTops: [...new Set(v.filter(x => x.reply).map(x => x.top))].join(",") || "-", plainTops: [...new Set(v.filter(x => !x.reply).map(x => x.top))].join(",") }; };

  const running = await ev(`[...Mecord.plugins.loaded.values()].filter(p=>p.state==='started').map(p=>p.entry.id)`);
  console.log("running:", running.join(", "));
  console.log("all on                 :", JSON.stringify(summarize(await measure())));
  if (process.argv.includes("--measure-only")) return;
  // Unload one plugin at a time (in memory only; config is untouched) and re-measure. A reload of Discord restores everything.
  for (const id of running) {
    await ev(`Mecord.plugins.unload(${JSON.stringify(id)})`);
    console.log(("minus " + id).padEnd(23) + ":", JSON.stringify(summarize(await measure())));
  }
  await ev("location.reload()").catch(() => {});
});
