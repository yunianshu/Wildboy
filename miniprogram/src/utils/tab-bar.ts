export const TAB_ITEMS = [
  { pagePath: "pages/home/index", text: "探索" },
  { pagePath: "pages/activities/index", text: "活动" },
  { pagePath: "pages/mine/index", text: "我的" },
];

type TabPage = {
  route?: string;
  getTabBar?: () => { setData(update: { selected: string }): void } | undefined;
};

type SwitchRequest = { from: string; target: string };
let pending: SwitchRequest | undefined;

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

/** Direct native routing: no optimistic selection, timers, storage or business requests. */
export function switchTab(path: unknown): void {
  const target = tabRoute(path);
  const from = syncTabBar();
  if (!target || !from || target === from || pending) return;
  const request = { from, target };
  pending = request;
  const finish = (failed: boolean) => {
    if (pending !== request) return;
    pending = undefined;
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
