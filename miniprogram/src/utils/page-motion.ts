import { takeTabDirection } from "./tab-bar";

type MotionPage = {
  route?: string;
  setData(update: { pageMotionClass: string }): void;
};

const entrances = new WeakMap<MotionPage, boolean>();

/** One visible-state arrival for push, back and repeated native Tab changes. */
export function enterPage(page: MotionPage): void {
  const alternate = !entrances.get(page);
  entrances.set(page, alternate);
  const cycle = alternate ? "a" : "b";
  const direction = takeTabDirection(page.route);
  try {
    // Distinct animation names restart on every show without a hidden frame,
    // layout reflow, timers, navigation wrappers or delayed business handlers.
    page.setData({
      pageMotionClass: direction
        ? `motion-tab-from-${direction} motion-tab-${cycle}`
        : `motion-enter-${cycle}`,
    });
  } catch (_) {
    // Motion is optional: the default WXSS keeps the page fully visible.
  }
}
