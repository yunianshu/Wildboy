import { request, login, logout, hasSession } from "../../utils/api";
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
Page({
  data: {
    loggedIn: false,
    loading: false,
    loadingMore: false,
    loggingIn: false,
    error: "",
    items: [] as Item[],
    page: 0,
    hasMore: true,
  },
  onShow() {
    this.setData({ loggedIn: hasSession() });
    if (this.data.loggedIn) void this.load(true);
    else this.setData({ items: [] });
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
  async signIn() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true, error: "" });
    try {
      await login();
      this.setData({ loggedIn: true });
      await this.load(true);
    } catch (e) {
      this.setData({ error: message(e) });
    } finally {
      this.setData({ loggingIn: false });
    }
  },
  async load(reset = true) {
    if (!hasSession()) return;
    if (
      !reset &&
      (this.data.loading || this.data.loadingMore || !this.data.hasMore)
    )
      return;
    const n = epoch.next();
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: "",
      ...(reset ? { items: [], page: 0, hasMore: true } : {}),
    });
    try {
      const p = await request<PageResult<Registration>>(
        `/me/registrations?page=${reset ? 0 : this.data.page + 1}&size=20`,
      );
      if (epoch.valid(n)) {
        const items = p.items.map((x) => ({
          ...x,
          dateText: dateLabel(x.createdAt),
        }));
        this.setData({
          items: reset ? items : mergeUnique(this.data.items, items),
          page: p.page,
          hasMore: p.hasMore,
        });
      }
    } catch (e) {
      if (epoch.valid(n))
        this.setData({ error: message(e), loggedIn: hasSession() });
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
  explore() {
    wx.switchTab({ url: "/pages/activities/index" });
  },
  privacy() {
    wx.navigateTo({ url: "/pages/privacy/index" });
  },
  async signOut() {
    const result = await wx.showModal({
      title: "退出登录？",
      content: "不会取消已报名的活动；重新登录同一微信账号即可查看。",
    });
    if (result.confirm) {
      epoch.invalidate();
      logout();
      this.setData({
        loggedIn: false,
        items: [],
        error: "",
        loading: false,
        loadingMore: false,
      });
    }
  },
});
