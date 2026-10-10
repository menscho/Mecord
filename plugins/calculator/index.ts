// @name Calculator
// @version 1.0.0
// @description /calc 2*(3+4)^2 — a safe expression evaluator (no eval). Supports + - * / % ^, parentheses, pi, e, sqrt/sin/cos/tan/log/ln/abs/round/floor/ceil.
// @tags commands, utility
// @category tools
import { definePlugin } from "@mecord/api";

const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil };
const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };

export function evaluate(src: string): number {
  const toks = src.toLowerCase().match(/\d+\.?\d*(?:e[+-]?\d+)?|[a-z]+|[-+*/%^(),]/g);
  if (!toks || toks.join("").length < src.replace(/\s/g, "").length) throw new Error("unexpected character");
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function primary(): number {
    const t = next();
    if (t === undefined) throw new Error("unexpected end");
    if (/^\d/.test(t)) return parseFloat(t);
    if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("missing )"); return v; }
    if (t === "-") return -power();
    if (t === "+") return power();
    if (t in CONST) return CONST[t];
    if (t in FN) { if (next() !== "(") throw new Error(`${t} needs (`); const v = expr(); if (next() !== ")") throw new Error("missing )"); return FN[t](v); }
    throw new Error(`unknown "${t}"`);
  }
  function power(): number { const b = primary(); if (peek() === "^") { next(); return Math.pow(b, power()); } return b; }
  function term(): number { let v = power(); while (peek() === "*" || peek() === "/" || peek() === "%") { const op = next(); const r = power(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; } return v; }
  function expr(): number { let v = term(); while (peek() === "+" || peek() === "-") { const op = next(); const r = term(); v = op === "+" ? v + r : v - r; } return v; }
  const v = expr();
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}"`);
  return v;
}

export default definePlugin({
  name: "Calculator",
  commands: [{
    name: "calc", description: "Evaluate a math expression", options: [{ name: "expression", description: "e.g. 2*(3+4)^2", required: true }],
    execute(a) {
      try { const v = evaluate(String(a.expression)); return { content: `${a.expression} = **${Number.isInteger(v) ? v : +v.toPrecision(12)}**` }; }
      catch (e: any) { return { content: `Can't calculate that: ${e.message}` }; }
    },
  }],
});
