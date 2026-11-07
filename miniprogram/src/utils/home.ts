import { activityView } from "./domain";
import { Activity, Home } from "./models";
import { originalPriceText, priceText } from "./product-prices";

export const HOME_ACTIVITY_COUNT = 4;

// Homepage shortcuts are independent from business activity categories.
export { defaultShortcuts as homeEntries } from "./home-shortcuts";

// Keep the API's departure-time order and original IDs; never repeat activities
// to fill empty positions.
export function homeActivitySlots(activities: Activity[]) {
  return activities.slice(0, HOME_ACTIVITY_COUNT).map((activity, index) => ({
    ...activityView(activity),
    slotKey: `home-activity-${index}`,
  }));
}

export type EquipmentCard = Home["equipment"][number];

/** Equipment cards keep the server label; a strikethrough original only appears
 * for a genuine markdown, never derived from a legacy label. */
export function homeEquipmentSlots(products: EquipmentCard[]) {
  return products.map((product) => {
    const original = originalPriceText(
      product.priceCents,
      product.originalPriceCents,
    );
    return {
      ...product,
      priceLabel:
        typeof product.priceLabel === "string" && product.priceLabel.trim()
          ? product.priceLabel
          : priceText(product.priceCents),
      ...(original ? { originalPriceText: original } : {}),
    };
  });
}
