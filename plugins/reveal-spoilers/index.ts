// @name Reveal Spoilers
// @version 1.0.0
// @description Spoiler text and spoiler images are shown automatically instead of needing a click.
// @tags chat
// @category chat
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Reveal Spoilers",
  styles: `[class*="spoilerContent"][class*="hidden"]{background:rgba(255,255,255,.08)!important}
    [class*="spoilerContent"][class*="hidden"] > *{visibility:visible!important;opacity:1!important}
    [class*="spoilerContent"][class*="hidden"]::after{display:none!important}
    [class*="obscureContent"],[class*="spoilerWarning"]{display:none!important}
    [class*="hiddenSpoiler"] img,[class*="hiddenSpoiler"] video{filter:none!important}`,
});
