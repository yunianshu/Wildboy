import { loadContent, ContentBlock } from "../../utils/content";
import { request, mediaUrl, hasSession, sessionVersion, isSessionCurrent } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { money } from "../../utils/shop";

import { ShopQuote, validShopQuote } from "../../utils/membership";
const quoteEpoch = new RequestEpoch();
const epoch = new RequestEpoch();
Page({
  _contentGeneration: 0,
  data: {
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentError: "",
    product: null as Product | null,
    priceText: "",
    originalPriceText: "",
    tierName: "",
    quoteLoading: false,
    quoteError: "",
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
  onShow() { if(this.data.product) void this.refreshQuote(); else if(this.data.id) void this.load(); },
  onHide() { quoteEpoch.invalidate(); epoch.invalidate(); this.setData({priceText:"",totalText:"",originalPriceText:"",tierName:"",quoteLoading:false}); },
  onUnload() {
    quoteEpoch.invalidate();
    this._contentGeneration++;
    epoch.invalidate();
  },
  async load() {
    const current = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const product = await request<Product>(`/shop/products/${this.data.id}`);
      if (epoch.valid(current)) {
        this.setData({
          product: { ...product, imageUrl: mediaUrl(product.imageUrl) },
          priceText: money(product.priceCents),
          totalText: money(product.priceCents * this.data.quantity),
        });
        await this.refreshQuote();
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
      if (this.data.id === id && generation === this._contentGeneration) this.setData({contentBlocks: document.blocks, contentError: ""});
    } catch (_) { if (this.data.id === id && generation === this._contentGeneration) this.setData({contentError: "图文暂未加载"}); }
  },
  async refreshQuote() {
    const n = quoteEpoch.next(), session = sessionVersion(), product = this.data.product;
    if(!product) return;
    this.setData({priceText:"",totalText:"",originalPriceText:"",tierName:"",quoteError:"",quoteLoading:false});
    if(!hasSession()) { this.setData({priceText:money(product.priceCents),totalText:money(product.priceCents*this.data.quantity),quoteError:"登录后可查看适用会员价"}); return; }
    this.setData({quoteLoading:true});
    try {
      const quote = await request<ShopQuote>(`/shop/products/${this.data.id}/quote?quantity=${this.data.quantity}`);
      if(!validShopQuote(quote,this.data.id,this.data.quantity)) throw new Error("报价异常，请在结算时重新确认");
      if(quoteEpoch.valid(n) && isSessionCurrent(session)) this.setData({priceText:money(quote.pricing.priceCents),totalText:money(quote.totalCents),originalPriceText:quote.totalCents!==quote.originalTotalCents?money(quote.pricing.originalPriceCents):"",tierName:quote.pricing.tierName||""});
    } catch(e) { if(quoteEpoch.valid(n) && isSessionCurrent(session)) this.setData({quoteError:message(e)}); }
    finally {if(quoteEpoch.valid(n)) this.setData({quoteLoading:false});}
  },
  retry() {
    void this.load();
  },
  changeQuantity(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.product) return;
    const delta = Number(event.currentTarget.dataset.delta);
    const quantity = Math.min(
      Math.min(99, this.data.product.stock),
      Math.max(1, this.data.quantity + delta),
    );
    this.setData({ quantity });
    void this.refreshQuote();
  },
  buy() {
    if (this.data.product?.stock)
      wx.navigateTo({
        url: `/pages/checkout/index?id=${this.data.id}&quantity=${this.data.quantity}`,
      });
  },
});
