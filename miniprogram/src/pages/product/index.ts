import { loadContent, ContentBlock } from "../../utils/content";
import { request, mediaUrl } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { money } from "../../utils/shop";

const epoch = new RequestEpoch();
Page({
  _contentGeneration: 0,
  data: {
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentError: "",
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
    if (id) { void this.load(); void this.loadRichContent(); }
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  onUnload() {
    this._contentGeneration++;
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
  async loadRichContent() {
    const id = this.data.id, generation = ++this._contentGeneration;
    try { const document = await loadContent(`/shop/products/${id}/content`);
      if (this.data.id === id && generation === this._contentGeneration) this.setData({contentBlocks: document.blocks, contentError: ""});
    } catch (_) { if (this.data.id === id && generation === this._contentGeneration) this.setData({contentError: "图文暂未加载"}); }
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
