import { activityView, categories } from "./domain";
import { Activity } from "./models";

export const HOME_ACTIVITY_COUNT = 4;

// The brand introduction is a homepage shortcut, not an activity category.
// Keep LEISURE unchanged in activity filters, forms and existing records.
export const homeEntries = categories.map((category) =>
  category.code === "LEISURE"
    ? { ...category, code: "INTRO", name: "野小子", en: "WILDBOY" }
    : { ...category },
);

// Keep the API's departure-time order and original IDs; never repeat activities
// to fill empty positions.
export function homeActivitySlots(activities: Activity[]) {
  return activities.slice(0, HOME_ACTIVITY_COUNT).map((activity, index) => ({
    ...activityView(activity),
    slotKey: `home-activity-${index}`,
  }));
}
