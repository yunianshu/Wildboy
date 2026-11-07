type WindowGeometry = { windowWidth?: number; windowHeight?: number; statusBarHeight?: number };
type MenuGeometry = { left: number; right: number; top: number; bottom: number; width: number; height: number };
export type CapsuleHeaderLayout = { top: number; height: number; rightInset: number };

const GUTTER = 16;
const CAPSULE_GAP = 12;
const NAVIGATION_HEIGHT = 44;
const FALLBACK_CAPSULE_HEIGHT = 32;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validMenu(rect: Partial<MenuGeometry> | null | undefined, width: number, height: number, status: number): rect is MenuGeometry {
  if (!rect || ![rect.left, rect.right, rect.top, rect.bottom, rect.width, rect.height].every(finite)) return false;
  const r = rect as MenuGeometry;
  return r.width > 0 && r.height >= 24 && r.height <= 64 &&
    r.left >= width / 2 && r.right <= width &&
    r.top >= status && r.top <= status + 64 && r.bottom <= height &&
    Math.abs(r.left + r.width - r.right) <= 1 &&
    Math.abs(r.top + r.height - r.bottom) <= 1;
}

/** Window-origin CSS pixels; rightInset is inside the page's existing 16px gutters. */
export function capsuleHeaderLayout(info?: WindowGeometry | null, menu?: Partial<MenuGeometry> | null): CapsuleHeaderLayout {
  const width = finite(info?.windowWidth) && info.windowWidth > 0 ? info.windowWidth : 375;
  const height = finite(info?.windowHeight) && info.windowHeight > 0 ? info.windowHeight : 800;
  const status = finite(info?.statusBarHeight) && info.statusBarHeight >= 0 && info.statusBarHeight <= height / 3
    ? info.statusBarHeight : 20;
  const valid = validMenu(menu, width, height, status);
  const rowHeight = valid ? menu.height : FALLBACK_CAPSULE_HEIGHT;
  const top = valid ? menu.top : status + (NAVIGATION_HEIGHT - rowHeight) / 2;
  const capsuleLeft = valid ? menu.left : Math.max(GUTTER, width - 88 - 8);
  return {
    top,
    height: rowHeight,
    rightInset: Math.min(Math.max(0, width - GUTTER * 2), Math.max(0, width - GUTTER - capsuleLeft + CAPSULE_GAP)),
  };
}

/** Read afresh on load/resize; one unavailable native API does not discard the other. */
export function measureCapsuleHeader(): CapsuleHeaderLayout {
  let info: WindowGeometry | undefined;
  let menu: Partial<MenuGeometry> | undefined;
  try { info = wx.getWindowInfo(); } catch (_) { /* Use a bounded layout fallback. */ }
  try { menu = wx.getMenuButtonBoundingClientRect(); } catch (_) { /* Keep the real status bar if available. */ }
  return capsuleHeaderLayout(info, menu);
}
