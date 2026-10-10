// @name Fun Commands
// @version 1.0.0
// @description /lenny, /disapproval, /sparkles, /8ball and /owo; optional text is appended.
// @tags commands, fun
// @category tools
import { definePlugin } from "@mecord/api";

const msg = { name: "message", description: "Optional text" };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const ANSWERS = ["It is certain.", "Without a doubt.", "Yes, definitely.", "Most likely.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.", "Cannot predict now.", "Don't count on it.", "My sources say no.", "Very doubtful."];

export default definePlugin({
  name: "Fun Commands",
  commands: [
    { name: "lenny", description: "Appends ( ͡° ͜ʖ ͡°)", options: [msg], execute: a => ({ content: `${a.message ? a.message + " " : ""}( ͡° ͜ʖ ͡°)` }) },
    { name: "disapproval", description: "Appends ಠ_ಠ", options: [msg], execute: a => ({ content: `${a.message ? a.message + " " : ""}ಠ_ಠ` }) },
    { name: "sparkles", description: "Wraps text in sparkles", options: [{ ...msg, required: true }], execute: a => ({ content: `✨ ${a.message} ✨` }) },
    { name: "8ball", description: "Ask the magic 8-ball", options: [{ name: "question", description: "Your question", required: true }], execute: a => ({ content: `🎱 *${a.question}* — **${pick(ANSWERS)}**` }) },
    { name: "owo", description: "owo-ify text", options: [{ ...msg, required: true }], execute: a => ({ content: String(a.message).replace(/[rl]/g, "w").replace(/[RL]/g, "W").replace(/n([aeiou])/g, "ny$1") + " owo" }) },
  ],
});
