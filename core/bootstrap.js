// Injected before any Discord script via Page.addScriptToEvaluateOnNewDocument.
(() => {
  if (window.__mecord) return;
  const send = (type, data) => {
    try { window.__mecordBinding(JSON.stringify({ type, data })); } catch {}
  };
  const state = (window.__mecord = { version: "0.0.1", modules: 0, safe: !!window.__mecordSafe });
  send("boot", { href: location.href });

  // Spike: report webpack chunk activity; the real patcher wraps push() here.
  const timer = setInterval(() => {
    const chunks = window.webpackChunkdiscord_app;
    if (!chunks) return;
    let n = 0;
    try { chunks.push([[Symbol("mecord")], {}, r => { n = Object.keys(r.m).length; }]); } catch {}
    state.modules = n;
    if (n > 1000) {
      clearInterval(timer);
      send("ready", { modules: n });
    }
  }, 500);
})();
