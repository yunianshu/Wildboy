import {
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { message, RequestEpoch, safeId } from "../../utils/domain";
import { PageResult } from "../../utils/models";
import {
  subscribeNotifications,
  notificationStatus,
} from "../../utils/notifications";
const epoch = new RequestEpoch();
type Notice = {
  id: string;
  activityId: string;
  title: string;
  detail: string;
  status: string;
  statusText?: string;
};
Page({
  data: {
    items: [] as Notice[],
    loading: false,
    busy: false,
    error: "",
    loggedIn: false,
    page: 0,
    hasMore: false,
  },
  onShow() {
    this.setData({ loggedIn: hasSession() });
    if (hasSession()) void this.load(true);
    else this.setData({ items: [] });
  },
  onHide() {
    epoch.invalidate();
    this.setData({ items: [], busy: false, loading: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async load(reset = true) {
    if (this.data.loading || !hasSession()) return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({ loading: true, error: "" });
    try {
      const p = await request<PageResult<Notice>>(
        `/me/notifications?page=${reset ? 0 : this.data.page + 1}&size=20`,
      );
      if (epoch.valid(n) && isSessionCurrent(session))
        this.setData({
          items: [
            ...(reset ? [] : this.data.items),
            ...p.items.map((i) => ({
              ...i,
              statusText: notificationStatus[i.status] || i.status,
            })),
          ],
          page: p.page,
          hasMore: p.hasMore,
        });
    } catch (e) {
      if (epoch.valid(n))
        this.setData({
          error: message(e),
          loggedIn: hasSession(),
          ...(!hasSession() ? { items: [] } : {}),
        });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load(true);
  },
  more() {
    if (this.data.hasMore) void this.load(false);
  },
  async subscribe() {
    if (this.data.busy) return;
    const n = epoch.next(),
      s = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      await subscribeNotifications();
      if (epoch.valid(n) && isSessionCurrent(s))
        wx.showToast({ title: "已订阅一次提醒", icon: "none" });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
});
