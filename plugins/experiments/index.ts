// @name Experiments
// @version 1.0.0
// @description Unlocks Discord's developer/experiment toggles (DeveloperExperimentStore). Best effort: depends on Discord's internals and can break on any update.
// @tags developer
// @category developer
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Experiments",
  patches: [{
    label: "isDeveloper getter",
    find: "DeveloperExperimentStore",
    replacement: {
      match: /(isDeveloper:\{configurable:!1,get:\(\)=>)\i/,
      replace: "$1!0",
    },
  }],
  renderSettings(el) {
    el.textContent = "Needs a Discord UI reload after enabling (patch applies when the module loads). Then open User Settings → Experiments / Developer Options. Experiments can change or break your client; use at your own risk.";
    el.style.cssText = "font-size:12.5px;color:#b5bac1";
  },
});
