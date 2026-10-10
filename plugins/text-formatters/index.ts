// @name Text Formatters
// @version 1.0.0
// @description /clap, /mock, /reverse, /wide, /spoiler, /bubble: transform text before sending.
// @tags commands, fun
// @category typing
import { definePlugin } from "@mecord/api";

const t = { name: "text", description: "Text to transform", required: true };
const wide = (s: string) => [...s].map(c => (c >= "!" && c <= "~" ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c === " " ? "　" : c)).join("");
const bubble = (s: string) => [...s].map(c => (/[a-z]/.test(c) ? String.fromCodePoint(0x24d0 + c.charCodeAt(0) - 97) : /[A-Z]/.test(c) ? String.fromCodePoint(0x24b6 + c.charCodeAt(0) - 65) : c)).join("");

export default definePlugin({
  name: "Text Formatters",
  commands: [
    { name: "clap", description: "Put 👏 between words", options: [t], execute: a => ({ content: String(a.text).trim().split(/\s+/).join(" 👏 ") + " 👏" }) },
    { name: "mock", description: "mOcK tExT", options: [t], execute: a => ({ content: [...String(a.text)].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("") }) },
    { name: "reverse", description: "Reverse text", options: [t], execute: a => ({ content: [...String(a.text)].reverse().join("") }) },
    { name: "wide", description: "ｆｕｌｌｗｉｄｔｈ text", options: [t], execute: a => ({ content: wide(String(a.text)) }) },
    { name: "spoiler", description: "Send text as a spoiler", options: [t], execute: a => ({ content: `||${a.text}||` }) },
    { name: "bubble", description: "ⓑⓤⓑⓑⓛⓔ text", options: [t], execute: a => ({ content: bubble(String(a.text)) }) },
  ],
});
