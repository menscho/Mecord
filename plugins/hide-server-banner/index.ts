// @name Hide Server Banners
// @version 1.0.0
// @description Hides the banner image at the top of server channel lists.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Server Banners",
  styles: "[class*=\"animatedContainer\"],[class*=\"bannerImage\"],[class*=\"guildBanner\"]{display:none!important}",
});
