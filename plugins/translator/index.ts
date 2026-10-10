// @name Translator
// @version 1.0.7
// @description Translate what you write before it's sent, and read other people's messages in your language. One button in the chat bar; works per channel.
// @tags chat, translation
// @capabilities net:translate.googleapis.com, net:api-free.deepl.com, net:api.deepl.com
// @category chat
import { definePlugin, ContextMenu, Commands, Stores, Styles, Toasts, Keybinds, h, type PluginCtx } from "@mecord/api";
import { messageActions, onFound, pasteIntoChat, textbox, wrap } from "../_lib";

// ───────── languages ─────────
const LANGS: [string, string][] = [
  ["en", "English"], ["de", "German"], ["fr", "French"], ["es", "Spanish"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["pl", "Polish"],
  ["tr", "Turkish"], ["ru", "Russian"], ["uk", "Ukrainian"], ["cs", "Czech"], ["sk", "Slovak"], ["hu", "Hungarian"], ["ro", "Romanian"], ["bg", "Bulgarian"],
  ["el", "Greek"], ["sv", "Swedish"], ["da", "Danish"], ["no", "Norwegian"], ["fi", "Finnish"], ["et", "Estonian"], ["lv", "Latvian"], ["lt", "Lithuanian"],
  ["ja", "Japanese"], ["ko", "Korean"], ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"], ["ar", "Arabic"], ["he", "Hebrew"], ["fa", "Persian"],
  ["hi", "Hindi"], ["bn", "Bengali"], ["ur", "Urdu"], ["th", "Thai"], ["vi", "Vietnamese"], ["id", "Indonesian"], ["ms", "Malay"], ["tl", "Filipino"], ["sw", "Swahili"],
  ["hr", "Croatian"], ["sr", "Serbian"], ["sl", "Slovenian"], ["ca", "Catalan"], ["is", "Icelandic"], ["af", "Afrikaans"],
];
const langName = (c: string) => LANGS.find(l => l[0].toLowerCase() === c.toLowerCase())?.[1] ?? c.toUpperCase();
const base = (c: string) => c.toLowerCase().split("-")[0];

// ───────── protecting things that must not be translated ─────────
const KEEP = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s<>]+|<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|<t:\d+(?::[tTdDfFR])?>|@everyone|@here/g;
export function protect(text: string) {
  const kept: string[] = [];
  const masked = text.replace(KEEP, m => { kept.push(m); return `[[${kept.length - 1}]]`; });
  return { masked, kept };
}
export function restore(text: string, kept: string[]) {
  const seen = new Set<number>();
  let out = text.replace(/\[\[\s*(\d+)\s*\]\]/g, (m, n) => { const i = Number(n); if (i < kept.length) { seen.add(i); return kept[i]; } return m; });
  const lost = kept.map((k, i) => (seen.has(i) ? null : k)).filter(Boolean) as string[];
  if (lost.length) out += " " + lost.join(" "); // never drop a mention, link or code block
  return out;
}
const hasWords = (masked: string) => (masked.replace(/\[\[\d+\]\]/g, "").match(/\p{L}/gu) ?? []).length >= 2;

function chunks(text: string, max = 1200): string[] {
  if (text.length <= max) return [text];
  const parts = text.split(/(\n+)/), out: string[] = [];
  let cur = "";
  const push = (s: string) => { if ((cur + s).length > max && cur) { out.push(cur); cur = ""; } cur += s; };
  for (const p of parts) {
    if (p.length <= max) push(p);
    else for (const s of p.split(/(?<=[.!?。！？])\s+/)) push(s.length > max ? s.slice(0, max) : s + " ");
  }
  if (cur) out.push(cur);
  return out;
}

// ───────── providers ─────────
interface Result { text: string; from: string }
async function viaGoogle(ctx: PluginCtx, text: string, to: string): Promise<Result> {
  const r = await ctx.net.fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`);
  if (r.status === 429) throw new Error("Google is rate-limiting translations. Wait a minute or switch to DeepL in the plugin options.");
  if (r.status !== 200) throw new Error(`The translation service answered ${r.status}`);
  const j = r.json();
  return { text: (j[0] as any[]).map(s => s[0]).join(""), from: String(j[2] ?? "") };
}
const DEEPL_TARGET: Record<string, string> = { en: "EN-US", pt: "PT-BR", "zh-CN": "ZH-HANS", "zh-TW": "ZH-HANT", no: "NB", tl: "EN-US" };
async function viaDeepL(ctx: PluginCtx, text: string, to: string): Promise<Result> {
  const key = (ctx.settings.get<string>("deeplKey") || "").trim();
  if (!key) throw new Error("Add your DeepL API key in the Translator options.");
  const hostName = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const r = await ctx.net.fetch(`https://${hostName}/v2/translate`, { method: "POST", headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: [text], target_lang: DEEPL_TARGET[to] ?? to.toUpperCase() }) });
  if (r.status === 403) throw new Error("DeepL rejected the API key.");
  if (r.status === 456) throw new Error("Your DeepL quota is used up.");
  if (r.status !== 200) throw new Error(`DeepL answered ${r.status}`);
  const t = r.json().translations[0];
  return { text: t.text, from: String(t.detected_source_language ?? "").toLowerCase() };
}

// ───────── per-channel state ─────────
interface ChanCfg { out?: string; inc?: boolean }
let chans: Record<string, ChanCfg> = {};

export default definePlugin({
  name: "Translator",
  settings: {
    mine: { type: "select", default: "en", label: "My language", description: "Messages in other languages get translated into this one.", options: LANGS.map(([value, label]) => ({ value, label })) },
    provider: { type: "select", default: "google", label: "Translation service", options: [{ label: "Google (free, no key)", value: "google" }, { label: "DeepL (your API key)", value: "deepl" }] },
    deeplKey: { type: "string", default: "", label: "DeepL API key", secret: true, description: "Only used when DeepL is selected. Keys ending in :fx use DeepL's free API." },
    keepOriginal: { type: "boolean", default: false, label: "Add my original text under translated messages", description: "Shown as small text, so people can see what you wrote." },
    onFail: { type: "select", default: "block", label: "If translating my message fails", options: [{ label: "Don't send, put my text back in the box", value: "block" }, { label: "Send it untranslated", value: "send" }] },
  },

  async start(ctx) {
    chans = await ctx.storage.get<Record<string, ChanCfg>>("channels", {});
    const saveChans = () => ctx.storage.set("channels", chans);
    const me = () => Stores.UserStore?.getCurrentUser?.()?.id as string | undefined;
    const chanId = () => Stores.SelectedChannelStore?.getChannelId?.() as string | undefined;
    const cfgOf = (id: string) => (chans[id] ??= {});

    // ── core translate with caching, masking and chunking ──
    const cache = new Map<string, Result & { skipped?: boolean }>();
    async function translate(text: string, to: string): Promise<Result & { skipped?: boolean }> {
      const key = `${ctx.settings.get("provider")}|${to}|${text}`;
      const hit = cache.get(key); if (hit) return hit;
      const { masked, kept } = protect(text);
      if (!hasWords(masked)) return { text, from: "", skipped: true };
      const call = ctx.settings.get<string>("provider") === "deepl" ? viaDeepL : viaGoogle;
      let from = "", out = "";
      for (const c of chunks(masked)) { const r = await call(ctx, c, to); from ||= r.from; out += r.text; }
      const res = { text: restore(out, kept), from, skipped: !!from && base(from) === base(to) };
      cache.set(key, res); if (cache.size > 300) cache.delete(cache.keys().next().value!);
      return res;
    }

    // ── my outgoing messages ──
    onFound(ctx, messageActions, MA => {
      ctx.add(wrap(MA, "sendMessage", orig => function (this: any, channelId: string, msg: any, ...rest: any[]) {
        const to = chans[channelId]?.out;
        if (!to || !msg || typeof msg.content !== "string" || !msg.content.trim() || msg.content.startsWith("/")) return orig.call(this, channelId, msg, ...rest);
        const self = this, original: string = msg.content;
        return (async () => {
          try {
            const r = await translate(original, to);
            if (!r.skipped) {
              msg.content = ctx.settings.get<boolean>("keepOriginal") ? `${r.text}\n-# ${original.replace(/\n/g, " ")}` : r.text;
            }
          } catch (e: any) {
            ctx.log.warn("outgoing translation failed", e);
            if (ctx.settings.get<string>("onFail") === "block") {
              Toasts.show(`Not sent: ${e.message}`, "error", { duration: 7000 });
              pasteIntoChat(original);
              return;
            }
            Toasts.show("Translation failed, sent as written", "warning");
          }
          return orig.call(self, channelId, msg, ...rest);
        })();
      }));
    }, "message actions");

    // ── other people's messages ──
    Styles.set("plugin-translator", `
      .mtr-box{margin:4px 0 2px;padding:6px 10px;border-left:3px solid color-mix(in srgb,currentColor 55%,transparent);background:color-mix(in srgb,currentColor 9%,transparent);border-radius:0 6px 6px 0;font-size:.94em;line-height:1.4;white-space:pre-wrap;word-break:break-word}
      .mtr-box small{display:flex;gap:10px;margin-top:3px;font-size:11px;opacity:.75}
      .mtr-box small a{cursor:pointer;color:inherit;text-decoration:underline}
      .mtr-box.err{border-left-color:#f0707a}
      [role="group"][class*="buttons_"] .mtr-tb{color:var(--interactive-icon-default,var(--interactive-normal,#b5bac1))}
      [role="group"][class*="buttons_"] .mtr-tb:hover{color:var(--interactive-icon-hover,var(--interactive-hover,#fff))}
      [role="group"][class*="buttons_"] .mtr-tb[data-open="1"]{color:var(--text-brand,#7aa7ff)}
      .mtr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:none;cursor:pointer;color:var(--interactive-normal,#b5bac1);position:relative;flex:none}
      .mtr-btn:hover{color:var(--interactive-hover,#fff)}.mtr-btn[data-on="1"]{color:var(--text-brand,#7aa7ff)}
      .mtr-btn[data-on="1"]::after{content:"";position:absolute;right:5px;top:5px;width:7px;height:7px;border-radius:50%;background:var(--text-brand,#7aa7ff)}
      .mtr-pop{box-sizing:border-box;position:fixed;z-index:2147483100;width:300px;background:#1b1e26;color:#e7e9f0;border:1px solid #2d3242;border-radius:14px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);font:13px/1.4 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
      .mtr-pop h4{margin:0 0 10px;font:600 15px Bahnschrift,"Segoe UI",sans-serif}
      .mtr-pop .r{display:flex;align-items:center;gap:10px;margin:8px 0}.mtr-pop .r b{font-weight:500;flex:1}
      .mtr-pop small{display:block;color:#8b92a5;margin-top:2px;font-weight:400}
      .mtr-pop select{width:100%;margin-top:6px;background:#12141a;color:#e7e9f0;border:1px solid #2d3242;border-radius:8px;padding:6px 8px;font:inherit}
      .mtr-pop hr{border:0;border-top:1px solid #2d3242;margin:12px 0}
      .mtr-sw{width:34px;height:20px;border-radius:10px;border:0;background:#3a4152;position:relative;cursor:pointer;flex:none}
      .mtr-sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .12s}
      .mtr-sw[aria-checked="true"]{background:#7aa7ff}.mtr-sw[aria-checked="true"]::after{transform:translateX(14px);background:#0a1226}`);
    ctx.add(() => { Styles.remove("plugin-translator"); document.querySelectorAll(".mtr-box,.mtr-pop,.mtr-btn,.mtr-tb").forEach(n => n.remove()); });

    // A reply message also contains the *replied-to* message's text (inside the reply preview, with that message's id), so
    // always look the text element up by this message's own id instead of taking the first message-content-* in the row.
    const contentOf = (li: Element | null | undefined, id: string) => li?.querySelector(`[id="message-content-${id}"]`) ?? null;
    const fiberMsg = (el: Element) => {
      let f: any = null;
      for (let n: Element | null = el, i = 0; n && i < 8 && !f; n = n.parentElement, i++) for (const k of Object.keys(n)) if (k.startsWith("__reactFiber$")) { f = (n as any)[k]; break; }
      for (let i = 0; f && i < 60; f = f.return, i++) { const m = f.memoizedProps?.message; if (m?.id && m?.channel_id && typeof m.content === "string") return m; }
      return null;
    };

    // A 1x1 canvas turns any CSS color (rgb, oklab, color-mix, …) into plain RGBA, so nothing has to be parsed by hand. Made once.
    const px = document.createElement("canvas"); px.width = px.height = 1;
    const g2 = px.getContext("2d", { willReadFrequently: true })!;
    /** Text color that is readable on whatever the message sits on, in any theme (this Discord build leaves the page root black, so never inherit). */
    const readableColor = (el: Element): string => {
      const parse = (s: string) => { g2.clearRect(0, 0, 1, 1); g2.fillStyle = "#000"; g2.fillStyle = s; g2.fillRect(0, 0, 1, 1); const d = g2.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
      const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      let bg = { r: 30, g: 31, b: 34 };
      for (let n: Element | null = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) { bg = c; break; } }
      const own = parse(getComputedStyle(el).color);
      const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (own && own.a > 0.5 && ratio(lum(own), lum(bg)) >= 4.5) return getComputedStyle(el).color;
      return lum(bg) < 0.4 ? "#f2f3f5" : "#1a1b1e"; // fall back to light-on-dark / dark-on-light
    };

    // ── a Translate button in the message hover toolbar (next to React / Forward / More) ──
    const TB_ICON = '<path d="M4 6h9M8.5 4v2M6 6c.4 3 2.4 5.5 5.5 7M11 6c-.4 3-2.8 6-6.5 7.5M13.5 20l4-9 4 9M15 17h5"/>';
    const setToolbarState = (msgId: string, open: boolean) => {
      for (const b of document.querySelectorAll(`.mtr-tb[data-msg="${msgId}"]`)) (b as HTMLElement).dataset.open = open ? "1" : "0";
    };
    /** Buttons are wrapped (tooltip wrapper + hidden label), so find the last real button's wrapper and sit just before it ("More"). */
    const moveBeforeMore = (inner: Element, b: Element) => {
      const buttons = [...inner.querySelectorAll('[role="button"]')].filter(x => x !== b);
      let anchor: Element | null = buttons[buttons.length - 1] ?? null;
      while (anchor && anchor.parentElement !== inner) anchor = anchor.parentElement;
      if (b.parentElement !== inner || b.nextElementSibling !== anchor) inner.insertBefore(b, anchor);
    };
    const decorateToolbars = (roots: Element[]) => {
      for (const inner of ctx.dom.within(roots, '[role="group"][class*="buttons_"] [class*="buttonsInner_"]')) {
        const existing = inner.querySelector(":scope > .mtr-tb");
        if (existing) { moveBeforeMore(inner, existing); continue; }
        const li = inner.closest('li[id^="chat-messages-"]') as HTMLElement | null;
        const m = li && fiberMsg(li);
        const sample = inner.querySelector('[role="button"][class*="hoverBarButton"]:last-of-type') ?? inner.querySelector('[role="button"]');
        if (!li || !m || !m.content?.trim() || !sample) continue;
        const b = sample.cloneNode(false) as HTMLElement; // no children, no React listeners; keeps Discord's button classes
        b.classList.add("mtr-tb");
        b.dataset.msg = m.id;
        b.removeAttribute("aria-label"); b.setAttribute("aria-label", "Translate"); b.setAttribute("title", "Translate message"); b.setAttribute("tabindex", "0");
        const svgClass = sample.querySelector("svg")?.getAttribute("class") ?? "";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "20"); svg.setAttribute("height", "20"); svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.8"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
        if (svgClass) svg.setAttribute("class", svgClass);
        svg.innerHTML = TB_ICON; // static markup
        b.append(svg);
        const el = contentOf(li, m.id);
        b.dataset.open = el?.parentElement?.querySelector(`.mtr-box[data-for="${m.id}"]`) ? "1" : "0";
        const go = (e: Event) => {
          e.stopPropagation(); e.preventDefault();
          const content = contentOf(li, m.id); if (!content) return;
          const open = content.parentElement?.querySelector(`.mtr-box[data-for="${m.id}"]`);
          if (open) { open.remove(); setToolbarState(m.id, false); } else showTranslation(content, m, true);
        };
        b.addEventListener("click", go);
        b.addEventListener("keydown", e => { if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") go(e); });
        moveBeforeMore(inner, b);
      }
    };

    let queue = 0; const waiting: (() => void)[] = [];
    const slot = async () => { if (queue >= 2) await new Promise<void>(r => waiting.push(r)); queue++; };
    const free = () => { queue--; waiting.shift()?.(); };

    async function showTranslation(contentEl: Element, m: any, manual: boolean) {
      const host = contentEl.parentElement!;
      host.querySelector(`.mtr-box[data-for="${m.id}"]`)?.remove();
      const box = h("div", { class: "mtr-box", "data-for": m.id }, "Translating…");
      box.style.color = readableColor(contentEl);
      contentEl.after(box);
      setToolbarState(m.id, true);
      await slot();
      try {
        const to = ctx.settings.get<string>("mine");
        const r = await translate(m.content, to);
        if (r.skipped) { box.remove(); setToolbarState(m.id, false); if (manual) Toasts.show(`That message is already in ${langName(to)}`, "info", { duration: 2000 }); return; }
        box.replaceChildren(r.text, h("small", null, r.from ? `Translated from ${langName(r.from)}` : "Translated", h("a", { onclick: () => { box.remove(); setToolbarState(m.id, false); } }, "Hide")));
      } catch (e: any) {
        box.classList.add("err"); box.replaceChildren(e.message, h("small", null, h("a", { onclick: () => showTranslation(contentEl, m, true) }, "Try again"), h("a", { onclick: () => { box.remove(); setToolbarState(m.id, false); } }, "Hide")));
      } finally { free(); }
    }

    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const m = fiberMsg(e.target);
        const cid = chanId();
        if (m && cid && chans[cid]?.inc && m.author?.id !== me() && m.content?.trim()) showTranslation(e.target, m, false);
      }
    });
    const scan = (roots: Element[]) => {
      const cid = chanId();
      if (!cid || !chans[cid]?.inc) return;
      for (const el of ctx.dom.within(roots, 'li[id^="chat-messages-"] [id^="message-content-"]:not([data-mtr])')) {
        const own = el.closest("li")?.id.split("-").pop(); // skip the replied-to preview
        if (el.id !== `message-content-${own}`) continue;
        (el as HTMLElement).dataset.mtr = "1"; io.observe(el);
      }
    };
    ctx.add(() => { io.disconnect(); document.querySelectorAll("[data-mtr]").forEach(n => delete (n as HTMLElement).dataset.mtr); });

    ctx.add(ContextMenu.register(c => {
      const m = c.message; if (!m?.content) return;
      return [{ label: "Translate", action: () => {
        const li = document.getElementById(`chat-messages-${m.channel_id}-${m.id}`);
        const el = contentOf(li, m.id); if (!el) return;
        const open = el.parentElement?.querySelector(`.mtr-box[data-for="${m.id}"]`);
        open ? open.remove() : showTranslation(el, m, true);
      } }];
    }));

    ctx.add(Commands.register({
      name: "tr", description: "Translate text into another language and send it",
      options: [{ name: "text", description: "What to translate", required: true }, { name: "to", description: "Language, e.g. de, ja, fr (defaults to My language)" }],
      async execute(a) {
        const code = String(a.to || "").trim();
        const to = LANGS.find(l => l[0].toLowerCase() === code.toLowerCase() || l[1].toLowerCase() === code.toLowerCase())?.[0] ?? (code ? code : ctx.settings.get<string>("mine"));
        const r = await translate(String(a.text), to);
        return { content: r.text };
      },
    }));

    // ── the chat-bar button and its popover ──
    const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h9M8.5 4v2M6 6c.4 3 2.4 5.5 5.5 7M11 6c-.4 3-2.8 6-6.5 7.5M13.5 20l4-9 4 9M15 17h5"/></svg>';
    const btn = h("button", { class: "mtr-btn", type: "button", title: "Translator  (Ctrl+Alt+T)", "aria-label": "Translator" });
    btn.innerHTML = ICON; // static markup above
    const refreshBtn = () => { const cid = chanId(); btn.dataset.on = cid && (chans[cid]?.out || chans[cid]?.inc) ? "1" : "0"; };
    let pop: HTMLElement | null = null;
    const closePop = () => { pop?.remove(); pop = null; };

    const openPop = () => {
      closePop();
      const cid = chanId(); if (!cid) return;
      const cfg = cfgOf(cid);
      const swi = (on: boolean, label: string, fn: (v: boolean) => void) => { const b = h("button", { class: "mtr-sw", role: "switch", "aria-checked": String(on), "aria-label": label }); b.addEventListener("click", () => { const v = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(v)); fn(v); }); return b; };
      const sel = (val: string, fn: (v: string) => void) => { const s = h("select", null, ...LANGS.map(([c, n]) => h("option", { value: c, selected: c === val }, n))); s.addEventListener("change", () => fn(s.value)); return s; };
      const outSel = sel(cfg.out ?? lastOut, v => { lastOut = v; if (cfg.out) { cfg.out = v; saveChans(); refreshBtn(); } });
      const outSw = swi(!!cfg.out, "Translate what I write", v => { cfg.out = v ? outSel.value : undefined; saveChans(); refreshBtn(); });
      const incSw = swi(!!cfg.inc, "Translate other people's messages", v => { cfg.inc = v; saveChans(); refreshBtn(); if (v) scan([document.body]); else document.querySelectorAll(".mtr-box").forEach(n => n.remove()); });
      const name = Stores.ChannelStore?.getChannel?.(cid)?.name;
      pop = h("div", { class: "mtr-pop", role: "dialog", "aria-label": "Translator" },
        h("h4", null, "Translator"), h("small", { style: { marginTop: "-6px", marginBottom: "6px" } }, name ? `For #${name} only` : "For this conversation only"),
        h("div", { class: "r" }, h("b", null, "Translate what I write", h("small", null, "Your message is translated just before it's sent.")), outSw), outSel,
        h("hr"),
        h("div", { class: "r" }, h("b", null, "Translate what others write", h("small", null, `Shown under their message, in ${langName(ctx.settings.get<string>("mine"))}.`)), incSw),
        h("small", { style: { marginTop: "10px" } }, "Right-click any message and choose Translate to do it once."));
      document.documentElement.append(pop);
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(innerWidth - 308, r.right - 300)) + "px";
      pop.style.top = Math.max(8, r.top - pop.offsetHeight - 10) + "px";
      setTimeout(() => (pop?.querySelector("button,select") as HTMLElement | null)?.focus(), 0);
    };
    let lastOut = ctx.settings.get<string>("mine") === "en" ? "de" : "en";
    btn.addEventListener("click", e => { e.stopPropagation(); pop ? closePop() : openPop(); });
    const outside = (e: MouseEvent) => { if (pop && !pop.contains(e.target as Node) && !btn.contains(e.target as Node)) closePop(); };
    document.addEventListener("mousedown", outside, true);
    // Escape closes the popup first; the shortcut itself is registered so it shows on the Shortcuts page.
    const keys = (e: KeyboardEvent) => { if (e.key === "Escape" && pop) { closePop(); e.stopPropagation(); } };
    window.addEventListener("keydown", keys, true);
    const dropToggle = Keybinds.register({
      id: "translator.toggle", label: "Translate my messages in this channel", group: "Translator", combo: "Ctrl+Alt+T",
      run: () => {
        const cid = chanId(); if (!cid) return;
        const c = cfgOf(cid);
        c.out = c.out ? undefined : lastOut; saveChans(); refreshBtn();
        Toasts.show(c.out ? `Your messages here are translated to ${langName(c.out)}` : "Translating your messages is off here", "info", { duration: 2200 });
      },
    });

    const place = (roots: Element[]) => {
      refreshBtn();
      if (!btn.isConnected) {
        const row = document.querySelector('[class*="channelTextArea"] [class*="buttons_"]');
        if (row) row.prepend(btn);
      }
      scan(roots);
      decorateToolbars(roots);
    };
    ctx.dom.onBatch(place);
    place([document.body]);
    ctx.add(() => { closePop(); btn.remove(); document.removeEventListener("mousedown", outside, true); window.removeEventListener("keydown", keys, true); });
    ctx.add(dropToggle);
    void textbox;
  },
});
