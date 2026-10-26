import { request, mediaUrl } from "../../utils/api";
import { Activity, PageResult } from "../../utils/models";
import {
  categories,
  validCategory,
  activityView,
  mergeUnique,
  RequestEpoch,
  message,
  safeId,
} from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    categories,
    selected: "",
    items: [] as ReturnType<typeof activityView>[],
    loading: false,
    loadingMore: false,
    error: "",
    page: 0,
    hasMore: true,
  },
  onShow() {
    const category = wx.getStorageSync("wildboy-category");
    if (category) {
      wx.removeStorageSync("wildboy-category");
      this.setData({ selected: validCategory(category) ? category : "" });
    }
    void this.load(true);
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
  select(e: WechatMiniprogram.TouchEvent) {
    const v = e.currentTarget.dataset.code || "";
    if (v === this.data.selected) return;
    this.setData({ selected: v });
    void this.load(true);
  },
  async load(reset = true) {
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
      const p = await request<PageResult<Activity>>(
        `/activities?page=${reset ? 0 : this.data.page + 1}&size=10${this.data.selected ? "&category=" + this.data.selected : ""}`,
      );
      if (epoch.valid(n)) {
        const items = p.items.map((x) =>
          activityView({ ...x, coverUrl: mediaUrl(x.coverUrl) }),
        );
        this.setData({
          items: reset ? items : mergeUnique(this.data.items, items),
          page: p.page,
          hasMore: p.hasMore,
        });
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false, loadingMore: false });
    }
  },
  retry() {
    void this.load(!this.data.items.length);
  },
  openActivity(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
});
