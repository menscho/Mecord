// @name Hide Typing Indicator
// @version 1.0.0
// @description Hides the "someone is typing…" bar under the chat box.
// @tags cosmetic, privacy
// @category privacy
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Typing Indicator",
  styles: "[class*=\"typing_\"]:not([class*=\"typingIndicator\"]),form [class*=\"typing\"]{visibility:hidden!important}",
});
