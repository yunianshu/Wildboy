import { config } from "../../config";
import { request, mediaUrl } from "../../utils/api";
import { Home, Activity, PageResult } from "../../utils/models";
import { categories, message, RequestEpoch, safeId } from "../../utils/domain";
import { HOME_ACTIVITY_COUNT, homeActivitySlots, fallbackBanners } from "../../utils/home";
const epoch = new RequestEpoch();
Page({
  data: {
    devMode: false,
    topInset: 48,
    home: null as Home | null,
    categories,
    items: [] as ReturnType<typeof homeActivitySlots>,
    banners: fallbackBanners,
    loading: false,
    error: "",
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
  async load() {
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      home: null,
      banners: fallbackBanners,
      items: [],
    });
    try {
      const [home, page] = await Promise.all([
        request<Home>("/home"),
        request<PageResult<Activity>>(`/activities?page=0&size=${HOME_ACTIVITY_COUNT}`),
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
        banners: home.banners.length
          ? home.banners.map((x) => ({ ...x, imageUrl: mediaUrl(x.imageUrl) }))
          : fallbackBanners,
        items: homeActivitySlots(
          page.items.map((x) => ({ ...x, coverUrl: mediaUrl(x.coverUrl) })),
        ),
      });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
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
    wx.setStorageSync("wildboy-category", "ALL");
    wx.switchTab({ url: "/pages/activities/index" });
  },
  equipmentInfo() {
    wx.switchTab({ url: "/pages/shop/index" });
  },
  openProduct(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/product/index?id=${id}` });
  },
});
