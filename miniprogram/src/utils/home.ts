import { activityView } from "./domain";
import { Activity, Home } from "./models";
import { originalPriceText, priceText } from "./product-prices";

export const HOME_ACTIVITY_COUNT = 6;
export const HOME_EQUIPMENT_COUNT = 4;

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
  return products.slice(0, HOME_EQUIPMENT_COUNT).map((product) => {
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

export const fallbackBanners: Home["banners"] = [
  {
    id: "scenery-mountains",
    title: "把周末还给山野",
    subtitle: "原创山野影像 · 一起向外走",
    imageUrl: "/assets/category-weekly.jpg",
    activityId: "",
  },
  {
    id: "scenery-camp",
    title: "在星空下，慢下来",
    subtitle: "原创露营影像 · 留一点时间给自己",
    imageUrl: "/assets/category-holiday.jpg",
    activityId: "",
  },
  {
    id: "scenery-coast",
    title: "沿着海风去出发",
    subtitle: "原创海岸影像 · 一起向外走",
    imageUrl: "/assets/category-leisure.jpg",
    activityId: "",
  },
];
