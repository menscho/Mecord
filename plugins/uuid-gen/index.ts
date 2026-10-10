// @name UUID Generator
// @version 1.0.0
// @description /uuid sends a random UUID v4; /snowflake <id> shows when a Discord ID was created.
// @tags commands, developer
// @category developer
import { definePlugin, Toasts } from "@mecord/api";

export default definePlugin({
  name: "UUID Generator",
  commands: [
    { name: "uuid", description: "Send a random UUID", execute: () => ({ content: crypto.randomUUID() }) },
    { name: "snowflake", description: "Show when a Discord ID was created", options: [{ name: "id", description: "User, message, channel or server ID", required: true }],
      execute(a) {
        try {
          const ms = Number((BigInt(String(a.id).trim()) >> 22n) + 1420070400000n);
          Toasts.show(`Created ${new Date(ms).toLocaleString()}`, "info", { duration: 6000 });
        } catch { Toasts.show("Not a valid Discord ID", "error"); }
      } },
  ],
});
