// @name Hide Active Now
// @version 1.0.0
// @description Hides the Active Now column on the Friends page.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Hide Active Now",
  styles: "[class*=\"nowPlayingColumn\"],[class*=\"activeNowColumn\"],aside[class*=\"nowPlaying\"]{display:none!important}",
});
