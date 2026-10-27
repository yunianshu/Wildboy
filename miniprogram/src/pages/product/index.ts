import { request, mediaUrl } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { money } from "../../utils/shop";

const epoch = new RequestEpoch();
Page({
  data: {
    id: "",
    product: null as Product | null,
    priceText: "",
    totalText: "",
    quantity: 1,
    loading: true,
    error: "",
  },
  onLoad(options: Record<string, string>) {
    const id = safeId(options.id);
    this.setData({ id });
    if (id) void this.load();
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  onUnload() {
    epoch.invalidate();
  },
  async load() {
    const current = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const product = await request<Product>(`/shop/products/${this.data.id}`);
      if (epoch.valid(current))
        this.setData({
          product: { ...product, imageUrl: mediaUrl(product.imageUrl) },
          priceText: money(product.priceCents),
          totalText: money(product.priceCents * this.data.quantity),
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
  changeQuantity(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.product) return;
    const delta = Number(event.currentTarget.dataset.delta);
    const quantity = Math.min(
      this.data.product.stock,
      Math.max(1, this.data.quantity + delta),
    );
    this.setData({
      quantity,
      totalText: money(this.data.product.priceCents * quantity),
    });
  },
  buy() {
    if (this.data.product?.stock)
      wx.navigateTo({
        url: `/pages/checkout/index?id=${this.data.id}&quantity=${this.data.quantity}`,
      });
  },
});
