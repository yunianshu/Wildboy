import { request, requireSession, ApiError, mediaUrl } from "../../utils/api";
import { Product, Order } from "../../utils/models";
import { message, safeId, RequestEpoch } from "../../utils/domain";
import { money, payOrder } from "../../utils/shop";
import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";

const epoch = new RequestEpoch();
Page({
  data: {
    id: "",
    quantity: 1,
    product: null as Product | null,
    totalText: "",
    recipientName: "",
    phone: "",
    address: "",
    legal: null as LegalCurrent | null,
    privacyRead: false,
    termsRead: false,
    consent: false,
    order: null as Order | null,
    orderTotalText: "",
    busy: false,
    loading: true,
    error: "",
  },
  onLoad(options: Record<string, string>) {
    const id = safeId(options.id);
    const parsed = Number(options.quantity);
    const quantity = Number.isInteger(parsed) ? Math.min(99, Math.max(1, parsed)) : 1;
    this.setData({ id, quantity });
    if (id) void this.load();
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  onHide() {
    epoch.invalidate();
    this.setData({ busy: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  async load() {
    const current = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const [product, legal] = await Promise.all([
        request<Product>(`/shop/products/${this.data.id}`),
        currentLegal(),
      ]);
      if (!epoch.valid(current)) return;
      if (this.data.quantity > product.stock) {
        this.setData({ error: "购买数量超过当前库存，请返回商品页调整" });
        return;
      }
      this.setData({
        product: { ...product, imageUrl: mediaUrl(product.imageUrl) },
        totalText: money(product.priceCents * this.data.quantity),
        legal,
        consent: false,
        privacyRead: false,
        termsRead: false,
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
  input(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field;
    if (["recipientName", "phone", "address"].includes(field))
      this.setData({ [field]: event.detail.value, error: "" });
  },
  consentChange(event: WechatMiniprogram.CheckboxGroupChange) {
    const consent = event.detail.value.includes("yes");
    if (consent && (!this.data.privacyRead || !this.data.termsRead)) {
      this.setData({ consent: false, error: "请先阅读隐私政策和用户协议" });
      return;
    }
    this.setData({ consent, error: "" });
  },
  privacy() {
    this.openDocument("PRIVACY");
  },
  terms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.legal) return;
    const expected = kind === "PRIVACY" ? this.data.legal.privacy?.version : this.data.legal.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.legal),
      events: {
        legalDocumentLoaded: (document: { kind: string; version: number }) => {
          const current = kind === "PRIVACY" ? this.data.legal?.privacy?.version : this.data.legal?.terms?.version;
          if (document.kind === kind && document.version === expected && current === expected)
            this.setData({ [kind === "PRIVACY" ? "privacyRead" : "termsRead"]: true });
        },
      },
    });
  },
  validate(): string {
    const name = this.data.recipientName.trim();
    if (name.length < 2 || name.length > 40) return "请填写 2–40 字的收货人姓名";
    if (!/^1[3-9]\d{9}$/.test(this.data.phone.trim())) return "请填写有效的中国大陆手机号";
    if (this.data.address.trim().length < 5 || this.data.address.trim().length > 300)
      return "请填写完整收货地址";
    if (!this.data.consent || !this.data.privacyRead || !this.data.termsRead)
      return "请阅读并同意当前隐私政策和用户协议";
    return "";
  },
  async submit() {
    if (this.data.busy) return;
    if (this.data.order) {
      await this.payExisting();
      return;
    }
    const invalid = this.validate();
    if (invalid || !this.data.product || !this.data.legal) {
      this.setData({ error: invalid || "订单信息尚未准备完成" });
      return;
    }
    this.setData({ busy: true, error: "" });
    const current = epoch.next();
    try {
      await requireSession();
      if (!epoch.valid(current)) return;
      const versions = versionsOf(this.data.legal);
      const latest = await currentLegal();
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({ legal: latest, consent: false, privacyRead: false, termsRead: false });
        throw new Error("协议版本已更新，请重新阅读并确认");
      }
      const order = await request<Order>("/orders", "POST", {
        items: [{ productId: this.data.id, quantity: this.data.quantity }],
        recipientName: this.data.recipientName.trim(),
        phone: this.data.phone.trim(),
        address: this.data.address.trim(),
        ...versions,
      });
      if (!order?.id || order.status !== "PENDING_PAYMENT")
        throw new Error("订单创建结果异常，请在我的订单中核对");
      this.setData({ order, orderTotalText: money(order.totalCents) });
      const paidOrder = await payOrder(order.id);
      if (epoch.valid(current))
        this.setData({ order: paidOrder, orderTotalText: money(paidOrder.totalCents) });
    } catch (error) {
      if (epoch.valid(current)) {
        if (error instanceof ApiError && ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(error.code))
          this.setData({ legal: null, consent: false, privacyRead: false, termsRead: false });
        this.setData({ error: message(error) });
      }
    } finally {
      if (epoch.valid(current)) this.setData({ busy: false });
    }
  },
  async payExisting() {
    if (this.data.busy || !this.data.order) return;
    this.setData({ busy: true, error: "" });
    const current = epoch.next();
    try {
      const order = await payOrder(this.data.order.id);
      if (epoch.valid(current)) this.setData({ order, orderTotalText: money(order.totalCents) });
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ busy: false });
    }
  },
  async refreshOrder() {
    if (!this.data.order) return;
    try {
      const order = await request<Order>(`/orders/${this.data.order.id}`);
      this.setData({ order, orderTotalText: money(order.totalCents) });
    } catch (error) {
      this.setData({ error: message(error) });
    }
  },
  orders() {
    wx.redirectTo({ url: "/pages/orders/index" });
  },
});
