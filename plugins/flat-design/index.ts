// @name Flat Design
// @version 1.0.0
// @description Removes shadows and rounded corners for a flatter look.
// @tags cosmetic
// @category look
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Flat Design",
  styles: "*{box-shadow:none!important}[class*=\"layer_\"],[class*=\"popout_\"],[class*=\"container_\"]{border-radius:2px!important}",
});
