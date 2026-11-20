import {
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { dateLabel, message, RequestEpoch, safeId, mergeUnique } from "../../utils/domain";
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
  createdAt?: string;
  statusText?: string;
};
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    items: [] as Notice[],
    loading: false,
    busy: false,
    error: "",
    loggedIn: false,
    page: 0,
    hasMore: false,
  },
  onShow() {
    enterPage(this);
    this.setData({ loggedIn: hasSession() });
    if (hasSession()) void this.load(true);
    else this.setData({ items: [], page: 0, hasMore: false, error: "" });
  },
  onHide() {
    epoch.invalidate();
    this.setData({ items: [], page: 0, hasMore: false, busy: false, loading: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async load(reset = true) {
    if (this.data.loading || this.data.busy || !hasSession() || (!reset && !this.data.hasMore)) return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({ loading: true, error: "", ...(reset ? { items: [], page: 0, hasMore: false } : {}) });
    try {
      const p = await request<PageResult<Notice>>(
        `/me/notifications?page=${reset ? 0 : this.data.page + 1}&size=20`,
      );
      if (epoch.valid(n) && isSessionCurrent(session))
        this.setData({
          items: mergeUnique(reset ? [] : this.data.items,
            p.items.map((i) => ({
              ...i,
              statusText: notificationStatus[i.status] || i.status,
              timeText: i.createdAt ? dateLabel(i.createdAt) : "",
            }))),
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
  onPullDownRefresh() {
    return this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    this.more();
  },
  more() {
    if (this.data.hasMore) void this.load(false);
  },
  async subscribe() {
    if (this.data.busy || this.data.loading) return;
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
