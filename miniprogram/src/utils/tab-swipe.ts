import { switchAdjacentTab } from "./tab-bar";

type SwipePage = { route?: string };
type TouchEvent = WechatMiniprogram.TouchEvent;
const origins = new WeakMap<SwipePage, WechatMiniprogram.TouchDetail>();
const verticalScrollThreshold = 12;
const swipeDistance = 56;

export function resetTabSwipe(page: SwipePage): void {
  origins.delete(page);
}

export const tabSwipeHandlers = {
  startTabSwipe(this: SwipePage, event: TouchEvent) {
    resetTabSwipe(this);
    if (!event.mark?.tabSwipeIgnore && event.touches.length === 1)
      origins.set(this, event.touches[0]);
  },
  moveTabSwipe(this: SwipePage, event: TouchEvent) {
    const origin = origins.get(this);
    if (!origin) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== origin.identifier) {
      resetTabSwipe(this);
      return;
    }
    const dx = Math.abs(touch.clientX - origin.clientX);
    const dy = Math.abs(touch.clientY - origin.clientY);
    // Once the gesture becomes a vertical scroll it cannot turn into a Tab change.
    if (dy >= verticalScrollThreshold && dy >= dx) resetTabSwipe(this);
  },
  endTabSwipe(this: SwipePage, event: TouchEvent) {
    const origin = origins.get(this);
    resetTabSwipe(this);
    if (!origin || event.touches.length || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (touch.identifier !== origin.identifier) return;
    const dx = touch.clientX - origin.clientX;
    const dy = touch.clientY - origin.clientY;
    if (Math.abs(dx) >= swipeDistance && Math.abs(dx) > Math.abs(dy) * 1.35)
      switchAdjacentTab(this, dx < 0 ? 1 : -1);
  },
  cancelTabSwipe(this: SwipePage) {
    resetTabSwipe(this);
  },
};
