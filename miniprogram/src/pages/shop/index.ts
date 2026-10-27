import { request, mediaUrl } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { money } from "../../utils/shop";

const epoch = new RequestEpoch();
type ProductView = Product & { priceText: string };
Page({
  data: {
    topInset: 48,
    items: [] as ProductView[],
    loading: true,
    error: "",
  },
  onLoad() {
    this.setData({ topInset: wx.getWindowInfo().statusBarHeight + 10 });
  },
  onShow() {
    void this.load();
  },
  onUnload() {
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    const current = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const products = await request<Product[]>("/shop/products");
      if (epoch.valid(current))
        this.setData({
          items: products.map((product) => ({
            ...product,
            imageUrl: mediaUrl(product.imageUrl),
            priceText: money(product.priceCents),
          })),
        });
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  open(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/product/index?id=${id}` });
  },
});
