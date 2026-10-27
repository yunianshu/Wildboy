import { activityView } from "./domain";
import { Activity, Home } from "./models";

export const HOME_ACTIVITY_COUNT = 6;

// Slots are presentation-only: retain the original activity ID for navigation
// and registration. Empty data never becomes fabricated activities.
export function homeActivitySlots(activities: Activity[]) {
  const source = activities.slice(0, HOME_ACTIVITY_COUNT);
  if (!source.length) return [];
  return Array.from({ length: HOME_ACTIVITY_COUNT }, (_, index) => ({
    ...activityView(source[index % source.length]),
    slotKey: `home-activity-${index}`,
  }));
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
    subtitle: "原创海岸影像 · 发现日常之外",
    imageUrl: "/assets/category-leisure.jpg",
    activityId: "",
  },
];
