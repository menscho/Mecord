// @name No Stickers
// @version 1.0.0
// @description Hides stickers in chat.
// @tags cosmetic, chat
// @category chat
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "No Stickers",
  styles: "[class*=\"stickerAsset\"],[class*=\"stickerContainer\"],[id^=\"message-accessories-\"] [class*=\"sticker\"]{display:none!important}",
});
