// @name Send Timestamp
// @version 1.0.0
// @description /timestamp 2026-12-24 18:00 sends a Discord timestamp that shows in every reader's own timezone. Also accepts "in 2h", "in 3d", "tomorrow 09:30".
// @tags commands, utility
// @category tools
import { definePlugin } from "@mecord/api";

function parse(s: string): Date | null {
  s = s.trim().toLowerCase();
  let m = /^in\s+(\d+)\s*(m|min|h|d|w)$/.exec(s);
  if (m) { const n = Number(m[1]), ms = { m: 6e4, min: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2] as "m"]!; return new Date(Date.now() + n * ms); }
  m = /^(today|tomorrow)(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) { const d = new Date(); if (m[1] === "tomorrow") d.setDate(d.getDate() + 1); d.setHours(Number(m[2] ?? 12), Number(m[3] ?? 0), 0, 0); return d; }
  const d = new Date(s.replace(" ", "T"));
  return isNaN(+d) ? null : d;
}

export default definePlugin({
  name: "Send Timestamp",
  commands: [{
    name: "timestamp", description: "Send a time everyone sees in their own timezone",
    options: [
      { name: "when", description: "e.g. 2026-12-24 18:00, in 2h, tomorrow 09:30", required: true },
      { name: "style", description: "t T d D f F R (default F, R = relative)" },
    ],
    execute(a) {
      const d = parse(String(a.when));
      if (!d) return { content: "Couldn't understand that time. Try `2026-12-24 18:00`, `in 2h` or `tomorrow 09:30`." };
      const style = /^[tTdDfFR]$/.test(String(a.style ?? "")) ? a.style : "F";
      return { content: `<t:${Math.floor(+d / 1000)}:${style}>` };
    },
  }],
});
