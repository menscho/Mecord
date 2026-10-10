// @name Dice Roller
// @version 1.0.0
// @description /roll 2d6+3 (any NdM±K) and /flip for a coin toss.
// @tags commands, fun
// @category tools
import { definePlugin } from "@mecord/api";

const rnd = (n: number) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return (b[0] % n) + 1; };

export default definePlugin({
  name: "Dice Roller",
  commands: [
    { name: "roll", description: "Roll dice, e.g. 2d6+3", options: [{ name: "dice", description: "NdM, optionally +K or -K (default 1d20)" }],
      execute(a) {
        const m = /^\s*(\d{0,3})d(\d{1,4})\s*([+-]\s*\d{1,5})?\s*$/i.exec(String(a.dice || "1d20"));
        if (!m) return { content: "Use the form NdM or NdM+K, e.g. 2d6+3" };
        const n = Math.max(1, Math.min(100, Number(m[1] || 1))), sides = Math.max(2, Number(m[2])), mod = m[3] ? Number(m[3].replace(/\s/g, "")) : 0;
        const rolls = Array.from({ length: n }, () => rnd(sides));
        const total = rolls.reduce((x, y) => x + y, 0) + mod;
        return { content: `🎲 ${n}d${sides}${mod ? (mod > 0 ? "+" : "") + mod : ""}: [${rolls.join(", ")}]${mod ? ` ${mod > 0 ? "+" : "−"} ${Math.abs(mod)}` : ""} = **${total}**` };
      } },
    { name: "flip", description: "Flip a coin", execute: () => ({ content: `🪙 ${rnd(2) === 1 ? "Heads" : "Tails"}` }) },
  ],
});
