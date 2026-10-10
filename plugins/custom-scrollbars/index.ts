// @name Custom Scrollbars
// @version 1.0.0
// @description Slim, theme-friendly scrollbars everywhere.
// @tags cosmetic
// @category look
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Custom Scrollbars",
  styles: "*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-thumb{background:#7c5cff88;border-radius:4px}*::-webkit-scrollbar-thumb:hover{background:#7c5cff}*::-webkit-scrollbar-track{background:transparent}",
});
