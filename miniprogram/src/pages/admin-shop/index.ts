import { request, isSessionCurrent, ApiError, mediaUrl } from "../../utils/api";
import { Product } from "../../utils/models";
import { message, safeId } from "../../utils/domain";
import { requireAdmin } from "../admin-editor/shared";
import { adminMoney } from "../../utils/admin-shop";
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    authorized: false,
    loading: false,
    busyId: "",
    error: "",
    items: [] as (Product & { cover: string; priceLabel: string })[],
  },
  _epoch: 0,
  _session: -1,
  onShow() {
    enterPage(this);
    void this.load();
  },
  onHide() {
    this._epoch++;
    this.setData({ authorized: false, items: [], loading: false, busyId: "" });
  },
  onUnload() {
    this._epoch++;
  },
  async load() {
    // A queued refresh must never invalidate an in-flight operation.
    if (this.data.busyId) return;
    const n = ++this._epoch;
    this.setData({ loading: true, error: "", items: [] });
    try {
      const s = await requireAdmin();
      if (n !== this._epoch) return;
      this._session = s;
      const items = await request<Product[]>("/admin/shop/products");
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      this.setData({
        authorized: true,
        items: items.map((x) => ({
          ...x,
          cover: mediaUrl(x.imageUrl),
          priceLabel: adminMoney(x.priceCents),
        })),
      });
    } catch (e) {
      if (n === this._epoch)
        this.setData({ error: message(e), authorized: false, items: [] });
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  create() {
    if (
      this.data.authorized &&
      isSessionCurrent(this._session) &&
      !this.data.busyId
    )
      wx.navigateTo({ url: "/pages/admin-product/index" });
  },
  edit(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (
      id &&
      this.data.authorized &&
      isSessionCurrent(this._session) &&
      !this.data.busyId
    )
      wx.navigateTo({ url: `/pages/admin-product/index?id=${id}` });
  },
  orders() {
    if (
      this.data.authorized &&
      isSessionCurrent(this._session) &&
      !this.data.busyId
    )
      wx.navigateTo({ url: "/pages/admin-orders/index" });
  },
});
