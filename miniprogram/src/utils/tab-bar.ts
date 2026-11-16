export const TAB_ITEMS = [
  { pagePath: "pages/home/index", text: "探索" },
  { pagePath: "pages/activities/index", text: "活动" },
  { pagePath: "pages/shop/index", text: "商城" },
  { pagePath: "pages/mine/index", text: "我的" },
];

type TabPage = {
  route?: string;
  getTabBar?: () => { setData(update: { selected: string }): void } | undefined;
};

type SwitchRequest = { from: string; target: string };
let pending: SwitchRequest | undefined;
let arrival: SwitchRequest | undefined;

function tabRoute(value: unknown): string {
  if (typeof value !== "string") return "";
  const route = value.replace(/^\//, "");
  return TAB_ITEMS.some(item => item.pagePath === route) ? route : "";
}

function visiblePage(): TabPage | undefined {
  if (typeof getCurrentPages !== "function") return undefined;
  const pages = getCurrentPages();
  return pages[pages.length - 1];
}

/** Each native Tab owns a different component; select from the visible route only. */
export function syncTabBar(page?: TabPage): string {
  const active = visiblePage();
  const route = tabRoute((active || page)?.route);
  if (route && arrival && route !== arrival.from && route !== arrival.target)
    arrival = undefined;
  if (!route) return "";
  // A page becoming visible settles the previous navigation even if its callback is late.
  if (pending && route !== pending.from) pending = undefined;
  const owner = active || page;
  try {
    owner?.getTabBar?.()?.setData({ selected: route });
  } catch (_) {
    // attached/pageLifetimes.show retries if the page component is not mounted yet.
  }
  return route;
}

/** Arrival can happen before or after the native callback or tab bar attachment. */
export function takeTabDirection(route?: string): "left" | "right" | undefined {
  const request = arrival;
  arrival = undefined;
  if (!request || tabRoute(route) !== request.target) return;
  const fromIndex = TAB_ITEMS.findIndex(item => item.pagePath === request.from);
  const targetIndex = TAB_ITEMS.findIndex(item => item.pagePath === request.target);
  return targetIndex > fromIndex ? "right" : "left";
}

export function switchAdjacentTab(page: TabPage, step: -1 | 1): void {
  const route = tabRoute(page.route);
  if (!route || tabRoute(visiblePage()?.route) !== route) return;
  const index = TAB_ITEMS.findIndex(item => item.pagePath === route);
  const target = TAB_ITEMS[index + step];
  if (target) switchTab(target.pagePath);
}

/** Route immediately and leave selection to the visible native page. */
export function switchTab(path: unknown): void {
  const target = tabRoute(path);
  const from = syncTabBar();
  if (!target || !from || target === from || pending) return;
  const request = { from, target };
  pending = request;
  arrival = request;
  const finish = (failed: boolean) => {
    if (pending !== request) return;
    pending = undefined;
    if (failed && arrival === request) arrival = undefined;
    const current = syncTabBar();
    if (failed && current === request.from)
      wx.showToast({ title: "页面切换失败，请重试", icon: "none" });
  };
  try {
    wx.switchTab({
      url: `/${target}`,
      success: () => finish(false),
      fail: () => finish(true),
    });
  } catch (_) {
    finish(true);
  }
}
