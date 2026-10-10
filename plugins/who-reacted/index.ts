// @name Who Reacted
// @version 1.0.1
// @description Hover a reaction to see who added it (first 20 people), without opening a menu.
// @tags chat
// @category chat
import { definePlugin, Webpack, Styles, h } from "@mecord/api";

function propsFromEl(el: HTMLElement) {
  let fiber: any = null;
  for (let n: HTMLElement | null = el, i = 0; n && i < 6 && !fiber; n = n.parentElement, i++) for (const k of Object.keys(n)) if (k.startsWith("__reactFiber$")) { fiber = (n as any)[k]; break; }
  for (let i = 0; fiber && i < 40; fiber = fiber.return, i++) {
    const p = fiber.memoizedProps;
    if (p?.emoji && p?.message?.id && p?.message?.channel_id) return { emoji: p.emoji, message: p.message };
    if (p?.emoji && p?.messageId && p?.channelId) return { emoji: p.emoji, message: { id: p.messageId, channel_id: p.channelId } };
  }
  return null;
}

export default definePlugin({
  name: "Who Reacted",
  settings: { delay: { type: "number", default: 350, label: "Hover delay (ms)", min: 100, max: 2000 } },
  start(ctx) {
    Styles.set("plugin-who-reacted", `.mecord-wr{position:fixed;z-index:2147483100;background:#111214;color:#dbdee1;border-radius:8px;padding:8px 10px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px #000a;pointer-events:none;max-width:260px}
      .mecord-wr div{display:flex;gap:6px;align-items:center;margin:2px 0}.mecord-wr img{width:18px;height:18px;border-radius:50%}`);
    let tip: HTMLElement | null = null, timer: any, hovered: Element | null = null;
    const cache = new Map<string, any[]>();
    const hide = () => { tip?.remove(); tip = null; };
    const REST = () => Webpack.findByProps("get", "post", "put", "patch", "del");

    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[class*="reaction_"],[class*="reactionBtn"]') as HTMLElement | null;
      if (el === hovered) return;
      hovered = el; clearTimeout(timer); hide();
      if (!el) return;
      timer = setTimeout(async () => {
        const info = propsFromEl(el);
        const rest = REST();
        if (!info || !rest) return;
        const em = info.emoji.id ? `${info.emoji.name}:${info.emoji.id}` : info.emoji.name;
        const key = `${info.message.id}/${em}`;
        let users = cache.get(key);
        try {
          if (!users) {
            const r = await rest.get({ url: `/channels/${info.message.channel_id}/messages/${info.message.id}/reactions/${encodeURIComponent(em)}`, query: { limit: 20, type: 0 }, oldFormErrors: true });
            users = r.body as any[]; cache.set(key, users);
            setTimeout(() => cache.delete(key), 15000);
          }
        } catch (err) { ctx.log.warn("reaction fetch failed", err); return; }
        if (hovered !== el) return;
        const r = el.getBoundingClientRect();
        tip = h("div", { class: "mecord-wr", style: { left: Math.max(4, r.left) + "px", top: Math.max(4, r.top - 8) + "px", transform: "translateY(-100%)" } },
          ...users.map(u => h("div", null, h("img", { src: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=32` : "https://cdn.discordapp.com/embed/avatars/0.png" }), u.global_name || u.username)),
          users.length === 0 && "No one");
        document.documentElement.append(tip);
      }, ctx.settings.get<number>("delay"));
    };
    document.addEventListener("mouseover", onOver, true);
    ctx.add(() => { document.removeEventListener("mouseover", onOver, true); clearTimeout(timer); hide(); Styles.remove("plugin-who-reacted"); });
  },
});
