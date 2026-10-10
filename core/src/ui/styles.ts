// The Mecord window's stylesheet. Written unscoped; index.ts prefixes every selector with #mecord-ui so Discord's
// global rules can't reach the window, and so the window's own rules win over them.
// Colours come from CSS variables that paint() sets from Discord's live theme (see tokens.ts).
export const CSS = `
*{box-sizing:border-box;letter-spacing:normal;text-transform:none;text-shadow:none}
.root{font:13.5px/1.45 var(--font,system-ui,sans-serif);color:var(--text);--faint:color-mix(in srgb,var(--muted) 70%,transparent);--hover:color-mix(in srgb,var(--text) 6%,transparent);--press:color-mix(in srgb,var(--text) 11%,transparent)}
button{font:inherit;color:inherit;cursor:pointer}
svg{fill:none;stroke:currentColor}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.scrim{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:color-mix(in srgb,var(--deep) 62%,transparent);backdrop-filter:blur(5px)}
.win{width:min(1100px,96vw);height:min(760px,93vh);display:grid;grid-template-columns:232px minmax(0,1fr);background:var(--panel);border:1px solid var(--line);border-radius:calc(var(--mecord-radius,12px) + 4px);overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5);animation:mecord-open .16s ease-out}
@keyframes mecord-open{from{opacity:0;transform:translateY(8px) scale(.985)}}
@media (prefers-reduced-motion:reduce){.win{animation:none}*{transition:none!important}}
/* rail */
.rail{background:var(--rail);border-right:1px solid var(--line);padding:18px 12px 12px;display:flex;flex-direction:column;gap:3px}
.brand{padding:0 10px 16px;display:flex;align-items:center;gap:9px}
.brand .logo{width:28px;height:28px;border-radius:8px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center}
.brand .logo svg{width:17px;height:17px;stroke:currentColor;stroke-width:2.2}
.brand b{font-size:17px;font-weight:700}.brand small{color:var(--faint);font-size:11px;margin-left:auto}
.nav{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:8px;color:var(--muted);cursor:pointer;position:relative}
.nav:hover{background:var(--hover);color:var(--text)}
.nav[aria-current=page]{background:var(--raised);color:var(--text);font-weight:600}
.nav[aria-current=page] svg{color:var(--accent)}
.nav:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.nav svg{width:18px;height:18px;flex:none}
.nav .n{margin-left:auto;font-size:11.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.nav .dot{margin-left:auto;width:8px;height:8px;border-radius:50%;background:var(--warn)}
.nav .dot.acc{background:var(--accent)}
.grow{flex:1;min-width:0}
.status{display:flex;gap:8px;align-items:center;padding:10px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);margin-top:8px}
.status i{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none}.status i.warn{background:var(--warn)}.status i.bad{background:var(--bad)}
.hint{padding:8px 10px 0;color:var(--faint);font-size:11.5px}
.hint kbd{font:inherit;font-size:11px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 4px;color:var(--muted)}
/* main */
.main{display:flex;flex-direction:column;min-width:0;min-height:0}
.head{padding:20px 24px 0 28px;display:flex;align-items:flex-start;gap:16px}
.head h1{margin:0;font-size:22px;font-weight:700;line-height:1.15}
.head p{margin:4px 0 0;color:var(--muted);max-width:60ch}
.head .slot{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.tools{padding:14px 28px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.tools .wraprow{display:flex;gap:6px;flex-wrap:wrap;width:100%;align-items:center}
.body{flex:1;min-height:0;overflow:auto;padding:4px 28px 28px;scrollbar-width:thin;scrollbar-color:var(--raised2) transparent}
.x{all:unset;box-sizing:border-box;cursor:pointer;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--muted);flex:none}.x:hover{background:var(--hover);color:var(--text)}
.x:focus-visible{outline:2px solid var(--accent)}.x svg{width:18px;height:18px}
/* controls */
.seg{display:inline-flex;background:var(--raised);border-radius:10px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 12px;border-radius:7px;color:var(--muted);font-weight:500;white-space:nowrap}
.seg button:hover{color:var(--text)}.seg button[aria-pressed=true]{background:var(--raised2);color:var(--text)}
.seg button:focus-visible{outline:2px solid var(--accent)}
.search{position:relative;display:inline-flex;align-items:center;flex:1;min-width:200px;max-width:380px}
.search > svg{position:absolute;left:10px;width:15px;height:15px;color:var(--faint);pointer-events:none}
.search input{padding-left:32px;padding-right:30px;width:100%}
.search .clr{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;right:6px;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:var(--muted)}
.search .clr:hover{background:var(--hover);color:var(--text)}.search .clr svg{width:13px;height:13px;stroke-width:2.2}
input[type=text],input[type=number],input[type=password],input[type=search],select,textarea{font:inherit;color:var(--text);background:var(--rail);border:1px solid var(--line);border-radius:9px;padding:7px 10px;outline:0}
input[type=text]:focus,input[type=number]:focus,input[type=password]:focus,input[type=search]:focus,select:focus,textarea:focus{border-color:var(--accent)}
input[type=color]{width:42px;height:30px;border:1px solid var(--line);border-radius:8px;background:none;padding:2px;cursor:pointer}
textarea{width:100%;resize:vertical;font-family:"Cascadia Code",Consolas,monospace;font-size:12.5px;line-height:1.5}
select{padding-right:26px;cursor:pointer}
.btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:8px;background:var(--raised2);color:var(--text);font-weight:500;cursor:pointer;white-space:nowrap}
.btn:hover{background:var(--press)}.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn.primary{background:var(--accent);color:var(--accent-ink)}.btn.primary:hover{filter:brightness(1.08)}
.btn.danger{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}.btn.danger:hover{background:color-mix(in srgb,var(--bad) 26%,transparent)}
.btn.ghost{background:transparent;color:var(--muted)}.btn.ghost:hover{background:var(--hover);color:var(--text)}
.btn.sm{height:26px;padding:0 9px;font-size:12.5px;border-radius:7px}
.btn[disabled]{opacity:.45;pointer-events:none}.btn svg{width:15px;height:15px}
.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chip{all:unset;box-sizing:border-box;cursor:pointer;padding:3px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12.5px;white-space:nowrap}
.chip:hover{color:var(--text);border-color:color-mix(in srgb,var(--text) 22%,transparent)}
.chip[aria-pressed=true]{color:var(--accent);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.chip .c{color:var(--faint);margin-left:5px;font-variant-numeric:tabular-nums}
.chip:focus-visible{outline:2px solid var(--accent)}
.chip.rm{border-style:dashed}
.sw{all:unset;box-sizing:border-box;cursor:pointer;width:36px;height:21px;border-radius:11px;background:color-mix(in srgb,var(--text) 22%,transparent);position:relative;flex:none;transition:background .12s}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:15px;height:15px;border-radius:50%;background:#fff;transition:transform .12s}
.sw[aria-checked=true]{background:var(--accent)}.sw[aria-checked=true]::after{transform:translateX(15px);background:var(--accent-ink)}
.sw:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pill{display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;background:var(--raised2);color:var(--muted);vertical-align:1px;font-weight:500;white-space:nowrap}
.pill.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}.pill.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.pill.bad{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}.pill.acc{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
.tag{all:unset;box-sizing:border-box;cursor:pointer;font-size:11px;padding:1px 7px;border-radius:6px;background:var(--hover);color:var(--muted);white-space:nowrap}
.tag:hover{color:var(--text);background:var(--press)}.tag[aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.cap{font-size:11px;padding:1px 7px;border-radius:6px;border:1px dashed var(--line);color:var(--muted);white-space:nowrap}
/* rows */
.list{margin-top:6px}
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 8px;border-bottom:1px solid var(--line);border-radius:10px}
.row:hover{background:color-mix(in srgb,var(--text) 2%,transparent)}
.row .t{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.row .t b{font-size:14px;font-weight:600}
.row .d{color:var(--muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.row .m{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;color:var(--faint);font-size:12px}
.row .a{display:flex;gap:6px;align-items:center}
.row .star{all:unset;box-sizing:border-box;cursor:pointer;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--faint)}
.row .star:hover{background:var(--hover);color:var(--text)}.row .star[aria-pressed=true]{color:#f0b232}.row .star svg{width:16px;height:16px}
.row .nm{all:unset;cursor:pointer;font-weight:600}.row .nm:hover{text-decoration:underline}
.row.off .t b{color:var(--muted)}
.row.grid-item{grid-template-columns:minmax(0,1fr);align-content:start}
.row.nosw{grid-template-columns:minmax(0,1fr) auto}
.list.grid .row.nosw{grid-template-columns:minmax(0,1fr)}
.list.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;align-items:start}
.list.grid > .grouphead,.list.grid > .empty,.list.grid > .note{grid-column:1/-1}
.list.grid .row{grid-template-columns:auto minmax(0,1fr);border:1px solid var(--line);border-radius:calc(var(--mecord-radius,12px) * .8);padding:12px;background:var(--raised);align-items:start}
.list.grid .row .a{grid-column:1/-1;justify-content:flex-end}
.list.grid .row .sw{grid-row:span 2}
.detail{grid-column:1/-1;margin:4px 0 0;padding:10px 12px;border-radius:10px;background:var(--rail);border:1px solid var(--line)}
.list.grid .detail{grid-column:1/-1}
.grouphead{display:flex;align-items:center;gap:10px;margin:22px 0 6px;padding:0 8px}
.grouphead h2{margin:0;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.grouphead span{color:var(--faint);font-size:12px}
.grouphead .btn{margin-left:auto}
.grouphead .btns{margin-left:auto;display:flex;gap:6px}
.set{display:flex;gap:14px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.set:first-child{border-top:0}.set .l{flex:1}.set .l b{font-weight:500}.set .l small{display:block;color:var(--muted)}
.info{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:8px 0;font-size:12.5px}
.info dt{color:var(--faint)}.info dd{margin:0;color:var(--muted);word-break:break-word}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.note{border:1px solid var(--line);background:var(--raised);border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;margin:14px 0 4px;flex-wrap:wrap}
.note.warn{border-color:color-mix(in srgb,var(--warn) 40%,transparent)}.note.bad{border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
.note .grow b{font-weight:600}
.empty{padding:40px 10px;text-align:center;color:var(--muted)}.empty b{display:block;color:var(--text);font-size:15px;margin-bottom:4px}
.err{color:var(--bad);font-size:12px;white-space:pre-wrap;margin-top:4px}
.section{margin:26px 0 8px;display:flex;align-items:baseline;gap:10px}.section h2{margin:0;font-size:15px;font-weight:700}.section span{color:var(--muted)}
mark{background:color-mix(in srgb,var(--accent) 30%,transparent);color:inherit;border-radius:3px;padding:0 1px}
/* themes */
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin-top:14px}
.tile{all:unset;box-sizing:border-box;display:block;position:relative;cursor:pointer;border-radius:calc(var(--mecord-radius,12px) + 2px);padding:8px;border:1px solid var(--line);background:var(--raised);transition:border-color .12s,transform .12s}
.tile:hover{border-color:color-mix(in srgb,var(--text) 26%,transparent);transform:translateY(-1px)}
.tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.tile[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.tile .meta{padding:9px 4px 3px}.tile .meta b{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14.5px;flex-wrap:wrap}
.tile .meta small{display:block;color:var(--muted);margin-top:2px;min-height:2.6em}
.tile .try{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;top:14px;right:14px;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--panel);color:var(--muted);border:1px solid var(--line)}
.tile .try:hover{color:var(--text);border-color:var(--accent)}
.pv{height:118px;border-radius:9px;display:flex;overflow:hidden;position:relative}
.pv > div{min-width:0;display:flex;flex-direction:column;gap:6px;padding:9px 8px;overflow:hidden}
.pv .rail2{align-items:center;padding:8px 0;gap:5px}.pv .rail2 u{width:12px;height:12px;border-radius:50%}
.pv u{display:block;height:5px;border-radius:3px}
.pv .chat{flex:1}
.pv .chat .bar{margin-top:auto;height:14px;border-radius:5px}
.pv.floating{gap:5px;padding:5px}.pv.floating > div{border-radius:7px}
.pv.dense .chat u{height:3px}
.pv.centred .chat{padding-left:20%;padding-right:20%}
.card{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:14px}
.card h3{margin:0 0 2px;font-size:15px;font-weight:700}.card p{margin:0 0 12px;color:var(--muted)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field{display:flex;flex-direction:column;gap:6px;margin-top:12px}.field > label,.lab{color:var(--muted);font-size:12.5px}
.range{display:flex;align-items:center;gap:12px;margin-top:8px}.range label{width:120px;color:var(--muted)}.range input{flex:1;accent-color:var(--accent)}.range output{width:48px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}th{color:var(--faint);text-align:left;font-weight:500;padding:8px 8px 8px 0;border-bottom:1px solid var(--line)}
td{padding:9px 8px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
.mono{font-family:"Cascadia Code",Consolas,monospace;font-size:12px}
pre{background:var(--rail);border:1px solid var(--line);border-radius:10px;padding:11px 13px;overflow:auto;max-height:260px;margin:6px 0;font:12px/1.5 "Cascadia Code",Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:var(--text)}
.bar2{height:6px;border-radius:3px;background:var(--raised2);overflow:hidden;min-width:120px}.bar2 i{display:block;height:100%;background:var(--accent);border-radius:3px}
/* quick css editor */
.cm{position:relative;margin-top:10px;border:1px solid var(--line);border-radius:10px;background:var(--rail);overflow:hidden}
.cm:focus-within{border-color:var(--accent)}
.cm-hl,.cm-in{box-sizing:border-box;margin:0;width:100%;height:440px;padding:12px 14px;font:12.5px/1.55 "Cascadia Code",Consolas,monospace;white-space:pre;overflow:auto;tab-size:2;border:0;border-radius:0;letter-spacing:0}
.cm-hl{position:absolute;inset:0;pointer-events:none;color:var(--text);background:transparent;scrollbar-width:none}
.cm-in{position:relative;display:block;background:transparent;color:transparent;caret-color:var(--text);resize:none;outline:0}
.cm-in::placeholder{color:var(--faint)}
.cm-in:focus{border:0}
.t-com{color:var(--faint);font-style:italic}.t-str{color:#e2a46b}.t-prop{color:var(--accent)}.t-var{color:#c59bff}.t-num{color:#8fd694}.t-at{color:#ff8fa3}.t-punc{color:var(--muted)}
.cm-ac{position:absolute;right:10px;bottom:10px;min-width:220px;max-height:240px;overflow:auto;background:var(--raised2);border:1px solid var(--line);border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:4px;z-index:2}
.cm-ac[hidden]{display:none}
.cm-ac button{all:unset;box-sizing:border-box;display:block;width:100%;padding:5px 9px;border-radius:6px;cursor:pointer;font:12.5px "Cascadia Code",Consolas,monospace;color:var(--muted)}
.cm-ac button.on,.cm-ac button:hover{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--text)}
/* palette */
.palwrap{position:fixed;inset:0;z-index:2147483002;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh;background:color-mix(in srgb,var(--deep) 55%,transparent)}
.palette{width:min(620px,92vw);background:var(--panel);border:1px solid var(--line);border-radius:calc(var(--mecord-radius,12px) + 2px);box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;animation:mecord-open .12s ease-out}
.palette input{width:100%;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:14px 16px;font-size:15px;background:transparent}
.pl{max-height:min(420px,60vh);overflow:auto;padding:6px}
.pli{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--text)}
.pli[aria-selected=true]{background:color-mix(in srgb,var(--accent) 16%,transparent)}
.pli .g{margin-left:auto;color:var(--faint);font-size:12px;white-space:nowrap}
.pli:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.plg{padding:8px 10px 3px;color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
/* keys */
.kc{display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap}
.kc span{font:12px "Cascadia Code",Consolas,monospace;padding:2px 7px;border-radius:6px;background:var(--raised2);border:1px solid var(--line);border-bottom-width:2px;color:var(--text)}
.kc em{font-style:normal;color:var(--faint)}
.rec{color:var(--accent);font-weight:600}
/* modals */
.modalwrap{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;background:color-mix(in srgb,var(--deep) 55%,transparent)}
.modal{width:min(480px,92vw);background:var(--raised);border:1px solid var(--line);border-radius:calc(var(--mecord-radius,12px) + 2px);padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.modal h3{margin:0 0 6px;font-size:17px;font-weight:700}.modal p{margin:6px 0;color:var(--muted)}.modal .acts{justify-content:flex-end;margin-top:16px}
.modal pre{max-height:320px}
`;
