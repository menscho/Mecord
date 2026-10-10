// @name Password Generator
// @version 1.0.0
// @description /password [length] generates a strong random password and copies it to your clipboard. It is never sent to chat.
// @tags commands, utility, privacy
// @category tools
import { definePlugin, Toasts, Utils } from "@mecord/api";

const SET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?";

export default definePlugin({
  name: "Password Generator",
  commands: [{
    name: "password", description: "Copy a random password to your clipboard (not sent)", options: [{ name: "length", description: "8–128, default 20", type: "integer" }],
    async execute(a) {
      const n = Math.max(8, Math.min(128, Number(a.length) || 20));
      const limit = 4294967296 - (4294967296 % SET.length); // rejection sampling: no modulo bias
      let out = "";
      const buf = new Uint32Array(1);
      while (out.length < n) { crypto.getRandomValues(buf); if (buf[0] < limit) out += SET[buf[0] % SET.length]; }
      await Utils.copy(out);
      Toasts.show(`Copied a ${n}-character password to the clipboard`, "success");
    },
  }],
});
