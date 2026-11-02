import { activityView } from "./domain";
import { Activity } from "./models";

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
