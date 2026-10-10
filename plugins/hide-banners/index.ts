// @name Hide Profile Banners
// @version 1.0.0
// @description Hides profile banners and profile effects in popouts and cards.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Profile Banners",
  styles: "[class*=\"banner_\"],[class*=\"profileEffects\"],[class*=\"bannerSVGWrapper\"]{display:none!important}",
});
