// @name Hide Gift Button
// @version 1.0.0
// @description Removes the gift button from the chat bar.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Gift Button",
  styles: "[class*=\"giftButton\"],button[aria-label=\"Send a gift\"],[aria-label=\"Send a gift\"]{display:none!important}",
});
