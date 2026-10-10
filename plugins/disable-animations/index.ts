// @name Disable Animations
// @version 1.0.0
// @description Turns off interface animations and transitions.
// @tags cosmetic, performance
// @category look
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Disable Animations",
  styles: "*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}",
});
