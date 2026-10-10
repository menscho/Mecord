// @name Base64 Tools
// @version 1.0.0
// @description /b64 encode|decode <text>: Unicode-safe Base64.
// @tags commands, utility
// @category tools
import { definePlugin } from "@mecord/api";

const enc = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dec = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0)));

export default definePlugin({
  name: "Base64 Tools",
  commands: [{
    name: "b64", description: "Base64 encode or decode text",
    options: [{ name: "mode", description: "encode or decode", required: true }, { name: "text", description: "Text", required: true }],
    execute(a) {
      try { return { content: String(a.mode).toLowerCase().startsWith("d") ? dec(String(a.text)) : enc(String(a.text)) }; }
      catch { return { content: "That isn't valid Base64." }; }
    },
  }],
});
