import { loadContent, ContentBlock } from "../../utils/content";
import type { MarkdownNode } from "../../utils/articles";
import { request, mediaUrl, hasSession, sessionVersion, isSessionCurrent } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { priceText, originalPriceText } from "../../utils/product-prices";
import { ShopQuote, validShopQuote } from "../../utils/membership";

const epoch = new RequestEpoch();
import { enterPage } from "../../utils/page-motion";

Page({
  _contentGeneration: 0,
  _quoteGeneration: 0,
  _visible: true,
  _quoteTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  data: {
    pageMotionClass: "",
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentNodes: [] as MarkdownNode[],
    contentError: "",
    product: null as Product | null,
    priceText: "",
    originalPriceText: "",
    totalText: "",
    quantity: 1,
    quoteLoading: false,
    loggedIn: false,
    quoteError: "",
    memberPriceText: "",
    memberTotalText: "",
    tierName: "",
    loading: true,
    error: "",
  },
  onShow() {
    enterPage(this);
    this._visible = true;
    this.setData({ loggedIn: hasSession() });
    if (this.data.product) void this.refreshQuote();
  },
  onLoad(options: Record<string, string>) {
    const id = safeId(options.id);
    this.setData({ id });
    if (id) { void this.load(); void this.loadRichContent(); }
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  onUnload() {
    this.onHide();
    this._contentGeneration++;
    epoch.invalidate();
  },
  onHide() {
    this._visible = false;
    this.clearQuote();
  },
  clearQuote() {
    clearTimeout(this._quoteTimer);
    this._quoteGeneration++;
    this.setData({ quoteLoading: false, quoteError: "", memberPriceText: "", memberTotalText: "", tierName: "" });
  },
  async refreshQuote() {
    this.clearQuote();
    const { id, product, quantity } = this.data;
    if (!this._visible || !id || !product || quantity > product.stock || !hasSession()) return;
    const n = this._quoteGeneration, session = sessionVersion();
    const current = () => this._visible && n === this._quoteGeneration &&
      isSessionCurrent(session) && id === this.data.id && quantity === this.data.quantity;
    this.setData({ quoteLoading: true });
    try {
      const quote = await request<ShopQuote>(`/shop/products/${id}/quote?quantity=${quantity}`);
      if (!current()) return;
      if (!validShopQuote(quote, id, quantity)) throw new Error("报价异常，请重新获取");
      if (quote.totalCents < quote.originalTotalCents)
        this.setData({ memberPriceText: priceText(quote.pricing.priceCents), memberTotalText: priceText(quote.totalCents), tierName: quote.pricing.tierName || "" });
    } catch (error) {
      if (current()) this.setData({ quoteError: message(error) });
    } finally {
      if (n === this._quoteGeneration) this.setData({ quoteLoading: false });
    }
  },
  async load() {
    const current = epoch.next();
    this.clearQuote();
    this.setData({ loading: true, error: "" });
    try {
      const product = await request<Product>(`/shop/products/${this.data.id}`);
      if (epoch.valid(current)) {
        this.setData({
          product: { ...product, imageUrl: mediaUrl(product.imageUrl) },
          // Quantity math uses the current price only; the higher original is display-only.
          priceText: priceText(product.priceCents),
          originalPriceText: originalPriceText(
            product.priceCents,
            product.originalPriceCents,
          ),
          totalText: priceText(product.priceCents * this.data.quantity),
        });
        void this.refreshQuote();
      }
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ loading: false });
    }
  },
  async loadRichContent() {
    const id = this.data.id, generation = ++this._contentGeneration;
    try { const document = await loadContent(`/shop/products/${id}/content`);
      if (this.data.id === id && generation === this._contentGeneration) {
        const nodes = Array.isArray(document.contentNodes) ? document.contentNodes : [];
        this.setData({
          contentBlocks: document.blocks,
          contentNodes: nodes.map((node) =>
            node.type === "image" ? { ...node, url: mediaUrl(node.url || "") } : node,
          ),
          contentError: "",
        });
      }
    } catch (_) { if (this.data.id === id && generation === this._contentGeneration) this.setData({contentError: "图文暂未加载"}); }
  },
  retry() {
    void this.load();
  },
  changeQuantity(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.product) return;
    const delta = Number(event.currentTarget.dataset.delta);
    if (delta !== -1 && delta !== 1) return;
    const quantity = Math.min(
      99,
      this.data.product.stock,
      Math.max(1, this.data.quantity + delta),
    );
    if (quantity < 1 || quantity === this.data.quantity) return;
    this.setData({
      quantity,
      totalText: priceText(this.data.product.priceCents * quantity),
    });
    this.clearQuote();
    this._quoteTimer = setTimeout(() => void this.refreshQuote(), 250);
  },
  previewImage() {
    const url = this.data.product?.imageUrl;
    if (url) wx.previewImage({ urls: [url] });
  },
  onShareAppMessage() {
    return {
      title: this.data.product?.name || "野小子装备",
      path: "/pages/product/index?id=" + encodeURIComponent(this.data.id),
      imageUrl: this.data.product?.imageUrl,
    };
  },
  buy() {
    if (this.data.product?.stock)
      wx.navigateTo({
        url: `/pages/checkout/index?id=${this.data.id}&quantity=${this.data.quantity}`,
      });
  },
});
