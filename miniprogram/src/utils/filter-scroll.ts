type HorizontalRect = { left: number; width: number };
export type FilterScrollPosition = { target: number; visualCurrent: number };

/** Native CSS pixels; a missing measurement must never invent a scroll position. */
export function centeredFilterScroll(
  viewport: HorizontalRect | null | undefined,
  item: HorizontalRect | null | undefined,
  track: HorizontalRect | null | undefined,
): FilterScrollPosition | null {
  if (!viewport || !item || !track) return null;
  const values = [viewport.left, viewport.width, item.left, item.width, track.left, track.width];
  if (!values.every(value => typeof value === "number" && Number.isFinite(value)) ||
      viewport.width <= 0 || item.width <= 0 || track.width <= 0) return null;
  // Both rectangles share the animated translation; their difference is stable
  // even when the native scrollOffset still describes a previous animation frame.
  const contentLeft = item.left - track.left;
  if (contentLeft < -0.5 || contentLeft + item.width > track.width + 0.5) return null;
  const desired = contentLeft + item.width / 2 - viewport.width / 2;
  const visualCurrent = viewport.left - track.left;
  if (!Number.isFinite(desired) || !Number.isFinite(visualCurrent)) return null;
  const maximum = Math.max(0, track.width - viewport.width);
  const clamp = (value: number) => Math.max(0, Math.min(maximum, value));
  return { target: clamp(desired), visualCurrent: clamp(visualCurrent) };
}
