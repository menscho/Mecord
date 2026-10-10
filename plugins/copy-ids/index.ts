// @name Copy IDs
// @version 1.0.0
// @description Right-click users, channels and servers to copy their IDs (no Developer Mode needed), and see when an ID was created.
// @tags developer, context-menu
// @category developer
import { definePlugin, ContextMenu, Toasts, Utils, type MenuItem } from "@mecord/api";

const created = (id: string) => new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toLocaleString();
const item = (label: string, id: string): MenuItem => ({ label, action: () => Utils.copy(id).then(() => Toasts.show(`Copied ${id} (created ${created(id)})`, "success", { duration: 2500 })) });

export default definePlugin({
  name: "Copy IDs",
  contextMenu(c) {
    const out: MenuItem[] = [];
    if (c.user?.id) out.push(item("Copy User ID", c.user.id));
    else if (c.message?.author?.id) out.push(item("Copy Author ID", c.message.author.id));
    if (c.kind === "channel" && c.channel?.id) out.push(item("Copy Channel ID", c.channel.id));
    if (c.kind === "guild" && c.guild?.id) out.push(item("Copy Server ID", c.guild.id));
    return out;
  },
});
