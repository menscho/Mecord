// @name Voice Messages
// @version 1.0.1
// @description Adds a microphone button to the chat bar: record, then the clip is attached to your message as an audio file (not Discord's native voice-message type).
// @tags chat, media
// @category media
import { definePlugin, Toasts, Styles, h } from "@mecord/api";
import { pasteIntoChat } from "../_lib";

export default definePlugin({
  name: "Voice Messages",
  settings: { maxSeconds: { type: "number", default: 120, label: "Maximum length (seconds)", min: 5, max: 600 } },
  start(ctx) {
    Styles.set("plugin-voice-messages", `.mecord-vm{width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:6px;font-size:18px;color:var(--interactive-normal,#b5bac1);background:none;border:0;flex:none}
      .mecord-vm:hover{color:var(--interactive-hover,#fff)}.mecord-vm.rec{color:#f23f43;animation:mvmpulse 1s infinite}@keyframes mvmpulse{50%{opacity:.45}}`);
    let rec: MediaRecorder | null = null, stream: MediaStream | null = null, chunks: Blob[] = [], timer: any, t0 = 0;
    const btn = h("button", { class: "mecord-vm", title: "Record voice message", "data-mecord": "vm", onclick: toggle }, "🎙");

    async function toggle() {
      if (rec) { rec.stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e: any) { Toasts.show("Microphone unavailable: " + (e?.message ?? e), "error"); return; }
      const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"].find(m => MediaRecorder.isTypeSupported(m)) ?? "";
      chunks = [];
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer); stream?.getTracks().forEach(t => t.stop());
        btn.classList.remove("rec"); btn.textContent = "🎙";
        const type = rec!.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : "webm";
        rec = null;
        const file = new File([new Blob(chunks, { type })], `voice-message.${ext}`, { type });
        if (file.size < 800) { Toasts.show("Recording was empty", "warning"); return; }
        if (!pasteIntoChat(file)) Toasts.show("Open a channel first, then record", "warning");
        else Toasts.show("Voice message attached. Press Enter to send.", "success");
      };
      rec.start(250);
      t0 = Date.now(); btn.classList.add("rec");
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        btn.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        if (s >= ctx.settings.get<number>("maxSeconds")) rec?.stop();
      }, 250);
    }

    const place = () => {
      if (btn.isConnected) return;
      const row = document.querySelector('[class*="channelTextArea"] [class*="buttons_"]') ?? document.querySelector('form [class*="buttons"]');
      if (row) row.prepend(btn);
    };
    // The button is put back only when Discord rebuilds the chat bar; the shared page hub reports those changes.
    ctx.dom.onBatch(place);
    place();
    ctx.add(() => { if (rec) { rec.onstop = null; rec.stop(); } stream?.getTracks().forEach(t => t.stop()); clearInterval(timer); btn.remove(); Styles.remove("plugin-voice-messages"); });
  },
});
