import { config } from "../../config";
import { request, mediaUrl } from "../../utils/api";
import { Home, Activity, PageResult } from "../../utils/models";
import {
  categories,
  activityView,
  message,
  mergeUnique,
  RequestEpoch,
  safeId,
} from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    devMode: false,
    topInset: 48,
    home: null as Home | null,
    categories,
    items: [] as ReturnType<typeof activityView>[],
    loading: false,
    loadingMore: false,
    error: "",
    feedError: "",
    page: 0,
    hasMore: true,
  },
  onLoad() {
    this.setData({
      devMode:
        config.devLogin &&
        wx.getAccountInfoSync().miniProgram.envVersion === "develop",
      topInset: wx.getWindowInfo().statusBarHeight + 12,
    });
    void this.load();
  },
  onUnload() {
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    void this.loadMore();
  },
  async load() {
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      feedError: "",
      items: [],
      page: 0,
      hasMore: true,
      loadingMore: false,
    });
    try {
      const [home, page] = await Promise.all([
        request<Home>("/home"),
        request<PageResult<Activity>>("/activities?page=0&size=10"),
      ]);
      if (!epoch.valid(n)) return;
      this.setData({
        home: {
          ...home,
          banners: home.banners.map((x) => ({
            ...x,
            imageUrl: mediaUrl(x.imageUrl),
          })),
          equipment: home.equipment.map((x) => ({
            ...x,
            imageUrl: mediaUrl(x.imageUrl),
          })),
        },
        items: page.items.map((x) =>
          activityView({ ...x, coverUrl: mediaUrl(x.coverUrl) }),
        ),
        hasMore: page.hasMore,
        page: page.page,
      });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  async loadMore() {
    if (
      this.data.loading ||
      this.data.loadingMore ||
      !this.data.hasMore ||
      this.data.error
    )
      return;
    const n = epoch.next();
    this.setData({ loadingMore: true, feedError: "" });
    try {
      const p = await request<PageResult<Activity>>(
        `/activities?page=${this.data.page + 1}&size=10`,
      );
      if (epoch.valid(n))
        this.setData({
          items: mergeUnique(
            this.data.items,
            p.items.map((x) =>
              activityView({ ...x, coverUrl: mediaUrl(x.coverUrl) }),
            ),
          ),
          page: p.page,
          hasMore: p.hasMore,
        });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ feedError: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loadingMore: false });
    }
  },
  retry() {
    void this.load();
  },
  retryMore() {
    void this.loadMore();
  },
  openActivity(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
  openCategory(e: WechatMiniprogram.TouchEvent) {
    const category = e.currentTarget.dataset.code;
    wx.setStorageSync("wildboy-category", category);
    wx.switchTab({ url: "/pages/activities/index" });
  },
  allActivities() {
    wx.switchTab({ url: "/pages/activities/index" });
  },
  equipmentInfo() {
    wx.showModal({
      title: "装备小店",
      content: "这里是户外装备展示区，暂不支持下单或付款。",
      showCancel: false,
    });
  },
});
