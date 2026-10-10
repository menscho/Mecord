// @name Square Avatars
// @version 1.0.0
// @description Squares off round avatars (slightly rounded corners).
// @tags cosmetic
// @category look
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Square Avatars",
  styles: "[class*=\"avatar_\"] img,[class*=\"avatar_\"] svg foreignObject,img[class*=\"avatar\"]{border-radius:6px!important}[class*=\"avatar_\"] mask{display:none}",
});
