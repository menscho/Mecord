// @name Hide Reactions
// @version 1.0.0
// @description Hides reactions under messages.
// @tags cosmetic, chat
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Reactions",
  styles: "[class*=\"reactions_\"]{display:none!important}",
});
