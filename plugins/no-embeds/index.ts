// @name No Embeds
// @version 1.0.0
// @description Hides link previews and embeds under messages.
// @tags cosmetic, chat
// @category chat
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "No Embeds",
  styles: "[id^=\"message-accessories-\"] [class*=\"embedWrapper\"],[id^=\"message-accessories-\"] [class*=\"embedFull\"],[class*=\"embedWrapper\"]{display:none!important}",
});
