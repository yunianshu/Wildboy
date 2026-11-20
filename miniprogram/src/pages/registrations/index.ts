import {
  request,
  login,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Registration, PageResult } from "../../utils/models";
import {
  message,
  dateLabel,
  mergeUnique,
  RequestEpoch,
  safeId,
} from "../../utils/domain";
const epoch = new RequestEpoch();
type Item = Registration & { dateText: string };
import { enterPage } from "../../utils/page-motion";

Page({
  _listSession: -1,
  _listLoaded: false,
  data: {
    pageMotionClass: "",
    loggedIn: false,
    loading: false,
    loadingMore: false,
    loggingIn: false,
    error: "",
    items: [] as Item[],
    page: 0,
    hasMore: true,
    status: "",
    total: 0,
  },
  onShow() {
    enterPage(this);
    const session = sessionVersion();
    const loggedIn = hasSession();
    if (this._listSession !== session || !loggedIn) {
      this._listSession = session;
      this._listLoaded = false;
      this.setData({ items: [], page: 0, hasMore: false, total: 0 });
    }
    this.setData({ loggedIn });
    if (loggedIn && !this._listLoaded) void this.load(true);
  },
  onHide() {
    epoch.invalidate();
    this.setData({ loading: false, loadingMore: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    void this.load(false);
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  select(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status;
    if (
      !["", "CONFIRMED", "CANCELLED"].includes(status) ||
      status === this.data.status
    )
      return;
    this.setData({ status });
    void this.load(true);
  },
  async load(reset = true) {
    if (!hasSession()) {
      this.setData({ loggedIn: false, items: [], total: 0 });
      return;
    }
    if (
      !reset &&
      (this.data.loading || this.data.loadingMore || !this.data.hasMore)
    )
      return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: "",
      ...(reset ? { items: [], total: 0, page: 0, hasMore: true } : {}),
    });
    try {
      const p = await request<PageResult<Registration>>(
        `/me/registrations?page=${reset ? 0 : this.data.page + 1}&size=20${this.data.status ? "&status=" + this.data.status : ""}`,
      );
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this._listLoaded = true;
      this._listSession = session;
      const items = p.items.map((x) => ({
        ...x,
        dateText: dateLabel(x.createdAt),
      }));
      this.setData({
        items: reset ? items : mergeUnique(this.data.items, items),
        page: p.page,
        hasMore: p.hasMore,
        total: p.total,
      });
    } catch (e) {
      if (epoch.valid(n))
        this.setData({
          error: message(e),
          loggedIn: hasSession(),
          ...(!hasSession() || !isSessionCurrent(session)
            ? { items: [], total: 0 }
            : {}),
        });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false, loadingMore: false });
    }
  },
  retry() {
    void this.load(!this.data.items.length);
  },
  open(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
  messages() { wx.navigateTo({url:"/pages/notifications/index"}); },
  activityOrders() { wx.navigateTo({ url: "/pages/activity-orders/index" }); },
  explore() {
    wx.switchTab({ url: "/pages/activities/index" });
  },
});
