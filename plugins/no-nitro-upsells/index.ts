// @name No Nitro Upsells
// @version 1.0.0
// @description Hides Nitro/Shop/Quests promotions and upsell banners.
// @tags cosmetic
// @category layout
import { definePlugin } from "@mecord/api";

export default definePlugin({
  name: "No Nitro Upsells",
  styles: "[class*=\"upsell\"],[class*=\"premiumPromo\"],[class*=\"nitroUpsell\"],[class*=\"giftButton\"],a[href=\"/store\"],a[href=\"/shop\"],a[href=\"/quest-home\"],[data-list-item-id$=\"___nitro\"],[data-list-item-id$=\"___shop\"],[data-list-item-id$=\"___quests\"]{display:none!important}",
});
