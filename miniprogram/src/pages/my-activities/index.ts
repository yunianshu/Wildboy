import { request, hasSession, sessionVersion, isSessionCurrent } from "../../utils/api";
import { dateLabel, message, mergeUnique, RequestEpoch, safeId } from "../../utils/domain";
import { PageResult } from "../../utils/models";
import { activityOrderStatus } from "../../utils/activity-orders";
import { notificationStatus, subscribeNotifications } from "../../utils/notifications";
import { money } from "../../utils/shop";
import { enterPage } from "../../utils/page-motion";

type Tab = "records" | "messages";
type RecordRow = {
  kind: "FREE" | "ORDER"; id: string; activityId: string; title: string;
  status: string; totalCents: number | null; createdAt: string;
};
type Notice = {
  id: string; activityId: string; title: string; detail: string; status: string; createdAt?: string;
};
type Card = {
  id: string; target: string; order: boolean; title: string; subtitle: string;
  statusText: string; dateText: string; amount: string;
};

function recordCard(r: RecordRow): Card {
  const order = r.kind === "ORDER";
  return {
    id: r.kind + ":" + r.id, target: order ? r.id : r.activityId, order, title: r.title,
    subtitle: order ? "报名订单" : "免费参与",
    statusText: order ? activityOrderStatus(r.status) : r.status === "CONFIRMED" ? "已报名" : r.status === "CANCELLED" ? "已取消" : "状态待核对",
    dateText: dateLabel(r.createdAt),
    amount: order && r.totalCents !== null ? money(r.totalCents) : "",
  };
}

function noticeCard(n: Notice): Card {
  return {
    id: n.id, target: n.activityId, order: false, title: n.title, subtitle: n.detail,
    statusText: notificationStatus[n.status] || n.status,
    dateText: n.createdAt ? dateLabel(n.createdAt) : "", amount: "",
  };
}

Page({
  _epoch: null as RequestEpoch | null,
  data: {
    pageMotionClass: "", tab: "records" as Tab, items: [] as Card[], loggedIn: false,
    loading: false, busy: false, error: "", page: 0, hasMore: false,
  },
  onLoad(query) {
    this._epoch = new RequestEpoch();
    if (query.tab === "messages") this.setData({ tab: "messages" });
  },
  onShow() {
    enterPage(this);
    const loggedIn = hasSession();
    this.setData({ loggedIn });
    if (loggedIn) void this.load();
  },
  onHide() {
    this._epoch?.invalidate();
    this.setData({ items: [], loading: false, busy: false, error: "", page: 0, hasMore: false });
  },
  onUnload() { this._epoch?.invalidate(); },
  select(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab;
    if ((tab !== "records" && tab !== "messages") || tab === this.data.tab || this.data.busy) return;
    this.setData({ tab, items: [], error: "", hasMore: false, page: 0 });
    void this.load();
  },
  async load(more = false) {
    const epoch = this._epoch ?? (this._epoch = new RequestEpoch());
    if (!hasSession()) {
      epoch.invalidate();
      this.setData({ loggedIn: false, loading: false, items: [], error: "", page: 0, hasMore: false });
      return;
    }
    if (this.data.busy || (more && (this.data.loading || !this.data.hasMore))) return;
    const n = epoch.next(), session = sessionVersion(), tab = this.data.tab;
    const page = more ? this.data.page + 1 : 0;
    this.setData({ loading: true, error: "", ...(!more ? { items: [], page: 0, hasMore: false } : {}) });
    try {
      const suffix = "?page=" + page + "&size=20";
      const result = tab === "records"
        ? await request<PageResult<RecordRow>>("/me/activity-records" + suffix)
        : await request<PageResult<Notice>>("/me/notifications" + suffix);
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      const rows = tab === "records"
        ? (result.items as RecordRow[]).map(recordCard)
        : (result.items as Notice[]).map(noticeCard);
      this.setData({ items: mergeUnique(more ? this.data.items : [], rows), page: result.page, hasMore: result.hasMore });
    } catch (e) {
      if (epoch.valid(n) && isSessionCurrent(session)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) {
        this.setData({ loading: false, ...(!isSessionCurrent(session) ? { loggedIn: hasSession(), items: [], page: 0, hasMore: false } : {}) });
      }
    }
  },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() { this.more(); },
  retry() { void this.load(this.data.items.length > 0 && this.data.hasMore); },
  more() { void this.load(true); },
  signIn() { wx.navigateTo({ url: "/pages/login/index" }); },
  explore() { wx.switchTab({ url: "/pages/activities/index" }); },
  open(e: WechatMiniprogram.TouchEvent) {
    const row = this.data.items.find((i) => i.id === e.currentTarget.dataset.id);
    const id = safeId(row?.target);
    if (!row || !id || !hasSession()) return;
    wx.navigateTo({ url: row.order ? "/pages/activity-orders/index?id=" + id : "/pages/detail/index?id=" + id });
  },
  async subscribe() {
    if (!hasSession() || this.data.tab !== "messages" || this.data.busy || this.data.loading) return;
    const epoch = this._epoch ?? (this._epoch = new RequestEpoch());
    const n = epoch.next(), session = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      await subscribeNotifications();
      if (epoch.valid(n) && isSessionCurrent(session)) wx.showToast({ title: "已订阅一次提醒", icon: "none" });
    } catch (e) {
      if (epoch.valid(n) && isSessionCurrent(session)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ busy: false });
    }
  },
});
