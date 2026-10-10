// @name Compact Plus
// @version 1.0.0
// @description Tighter spacing in messages, member list and channel list.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "Compact Plus",
  styles: "[class*=\"cozy\"] [class*=\"message_\"]{padding-top:.1rem!important;padding-bottom:.1rem!important}[class*=\"member_\"]{margin-top:0!important;height:36px!important}[class*=\"avatar_\"]{--custom-avatar-size:32px}",
});
