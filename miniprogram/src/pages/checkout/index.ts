import {
  request,
  requireSession,
  ApiError,
  mediaUrl,
  getCurrentUser,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Product, Order, ShippingAddress } from "../../utils/models";
import { message, safeId, RequestEpoch, dateLabel } from "../../utils/domain";
import {
  money,
  payOrder,
  verifyPayment,
  orderStatusLabel,
  checkoutRequestId,
  finishCheckoutIntent,
  pendingCheckoutRequestId,
} from "../../utils/shop";
import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";

import { ShopQuote, validShopQuote } from "../../utils/membership";
const quoteEpoch = new RequestEpoch();
const epoch = new RequestEpoch();
const addressEpoch = new RequestEpoch();
import { enterPage } from "../../utils/page-motion";

Page({
  _hadSession: true,
  _loading: false,
  data: {
    pageMotionClass: "",
    id: "",
    session: -1,
    quantity: 1,
    product: null as Product | null,
    totalText: "",
    originalTotalText: "",
    tierName: "",
    quote: null as ShopQuote | null,
    quoteSession: -1,
    quoteLoading: false,
    quoteError: "",
    quoteLoginRequired: false,
    selectedAddressId: "",
    addressLoading: false,
    addressError: "",
    recipientName: "",
    phone: "",
    address: "",
    legal: null as LegalCurrent | null,
    privacyRead: false,
    termsRead: false,
    consent: false,
    order: null as Order | null,
    orderTotalText: "",
    orderOriginalTotalText: "",
    orderStatusText: "",
    orderDeadlineText: "",
    awaitingConfirmation: false,
    recoveredOrder: false,
    recoveringOrder: false,
    recoveryError: "",
    busy: false,
    loading: true,
    error: "",
  },
  onLoad(options: Record<string, string>) {
    const id = safeId(options.id);
    const parsed = Number(options.quantity);
    const quantity = Number.isInteger(parsed)
      ? Math.min(99, Math.max(1, parsed))
      : 1;
    this._hadSession = hasSession();
    this.setData({ id, quantity, session: sessionVersion() });
    if (id) void this.load();
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  _showGeneration: 0,
  async onShow() {
    enterPage(this);
    const visit = ++this._showGeneration;
    const session = sessionVersion();
    const authenticated = hasSession();
    const changed = this.data.session !== -1 && this.data.session !== session;
    const firstLogin = !this._hadSession && authenticated && session === this.data.session + 1;
    this._hadSession = authenticated;
    if (changed && firstLogin) this.setData({ session, error: "" });
    else if (changed) {
      epoch.invalidate();
      addressEpoch.invalidate();
      quoteEpoch.invalidate();
      this._loading = false;
      this.setData({
        session: sessionVersion(),
        quote: null, quoteSession: -1, totalText: "", originalTotalText: "", tierName: "",
        selectedAddressId: "",
        addressLoading: false,
        addressError: "",
        recipientName: "",
        phone: "",
        address: "",
        order: null,
        recoveredOrder: false,
        recoveringOrder: false,
        recoveryError: "",
        awaitingConfirmation: false,
        consent: false,
        privacyRead: false,
        termsRead: false,
        busy: false,
        error: "账号已改变，请重新确认收货信息",
      });
    }
    if (this.data.id && (this.data.loading || changed || (!this.data.product && !this.data.order))) await this.load();
    else if (!this.data.order) await this.resumeCheckout();
    if (visit === this._showGeneration && isSessionCurrent(session)) await this.reconcilePayment();
  },
  onHide() {
    this._showGeneration++;
    epoch.invalidate();
    addressEpoch.invalidate();
    quoteEpoch.invalidate();
    this._loading = false;
    this.setData({ busy: false, recoveringOrder: false, quote: null, quoteSession: -1, totalText: "", originalTotalText: "", tierName: "", quoteLoading: false });
  },
  onUnload() {
    this._showGeneration++;
    quoteEpoch.invalidate();
    epoch.invalidate();
    addressEpoch.invalidate();
  },
  async load() {
    if (this._loading || this.data.recoveringOrder || this.data.busy) return;
    this._loading = true;
    const current = epoch.next();
    this.setData({ loading: true, error: "", recoveryError: "" });
    const session = sessionVersion();
    const valid = () => epoch.valid(current) && isSessionCurrent(session);
    try {
      if (await this.recoverIntent(valid) || !valid()) return;
      const [product, legal] = await Promise.all([
        request<Product>(`/shop/products/${this.data.id}`),
        currentLegal(),
      ]);
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      if (this.data.quantity > product.stock) {
        this.setData({
          error: "购买数量超过当前库存；如之前已提交，请先核对我的订单",
        });
      }
      this.setData({
        product: { ...product, imageUrl: mediaUrl(product.imageUrl) },

        legal,
        consent: false,
        privacyRead: false,
        termsRead: false,
      });
      void this.refreshQuote();
      void this.refreshAddress();
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) {
        this._loading = false;
        this.setData({ loading: false });
      }
    }
  },
  async recoverIntent(current: () => boolean): Promise<boolean> {
    if (!hasSession()) return false;
    const { id, quantity } = this.data;
    const user = await getCurrentUser();
    if (!current()) return false;
    const key = pendingCheckoutRequestId(user.id, id, quantity);
    if (!key) return false;
    let order: Order;
    try {
      order = await request<Order>(`/orders/by-request/${key}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return false;
      throw error;
    }
    if (!current()) return false;
    if (!safeId(order?.id)) throw new Error("原订单状态未确认，请重新核对");
    quoteEpoch.invalidate();
    addressEpoch.invalidate();
    this.showOrder(order);
    this.setData({ recoveredOrder: true, awaitingConfirmation: false, recoveryError: "", quoteLoading: false, addressLoading: false });
    finishCheckoutIntent(user.id, id, quantity, key);
    return true;
  },
  changeQuantity(event: WechatMiniprogram.TouchEvent) {
    const { product, quantity, busy, recoveringOrder, recoveryError, order } = this.data;
    const delta = Number(event.currentTarget.dataset.delta);
    if (!product || ![1, -1].includes(delta) || busy || recoveringOrder || recoveryError || order) return;
    const next = Math.min(99, product.stock, Math.max(1, quantity + delta));
    if (next < 1 || next === quantity) return;
    epoch.invalidate();
    this.setData({ quantity: next, error: "", quote: null, quoteSession: -1, totalText: "" });
    void this.resumeCheckout();
  },
  async resumeCheckout() {
    if (!this.data.id || this.data.order || this.data.busy || this._loading || this.data.recoveringOrder) return;
    if (!this.data.product) {
      await this.load();
      return;
    }
    const n = epoch.next(), session = sessionVersion();
    const current = () => epoch.valid(n) && isSessionCurrent(session);
    this.setData({ recoveringOrder: true, recoveryError: "" });
    try {
      if (await this.recoverIntent(current) || !current()) return;
      await Promise.all([this.refreshQuote(), this.refreshAddress()]);
    } catch (error) {
      if (current()) this.setData({ recoveryError: message(error) });
    } finally {
      if (epoch.valid(n)) this.setData({ recoveringOrder: false });
    }
  },
  async refreshQuote() {
    const n = quoteEpoch.next(), session = sessionVersion();
    const { id, quantity, product } = this.data;
    this.setData({ quote: null, quoteSession: -1, totalText: "", originalTotalText: "", tierName: "", quoteLoading: false, quoteError: "", quoteLoginRequired: false });
    if (!id || !product || this.data.order) return;
    if (!hasSession()) { this.setData({ quoteLoginRequired: true }); return; }
    if (quantity > product.stock) {
      this.setData({ quoteError: "购买数量超过当前库存，请返回商品详情调整数量" });
      return;
    }
    const current = () => quoteEpoch.valid(n) && isSessionCurrent(session) &&
      id === this.data.id && quantity === this.data.quantity && !this.data.order;
    this.setData({quoteLoading:true});
    try {
      const quote = await request<ShopQuote>(`/shop/products/${id}/quote?quantity=${quantity}`);
      if (!current()) return;
      if (!validShopQuote(quote, id, quantity)) throw new Error("报价异常，请重新获取");
      this.setData({ quote, quoteSession: session, totalText: money(quote.totalCents), originalTotalText: money(quote.originalTotalCents), tierName: quote.pricing.tierName || "" });
    } catch(error) { if (current()) this.setData({ quoteError: message(error) }); }
    finally { if(quoteEpoch.valid(n)) this.setData({quoteLoading:false}); }
  },
  login() { wx.navigateTo({url:"/pages/login/index"}); },
  retry() {
    void this.load();
  },
  async refreshAddress() {
    const n = addressEpoch.next();
    const session = sessionVersion();
    this.setData({ addressLoading: hasSession(), addressError: "" });
    if (!hasSession()) {
      this.setData({
        selectedAddressId: "",
        recipientName: "",
        phone: "",
        address: "",
      });
      return;
    }
    try {
      const result = await request<{ items: ShippingAddress[] }>(
        "/me/addresses",
      );
      if (
        !addressEpoch.valid(n) ||
        !isSessionCurrent(session) ||
        this.data.order
      )
        return;
      const address =
        result.items.find((item) => item.id === this.data.selectedAddressId) ||
        result.items.find((item) => item.isDefault) ||
        result.items[0];
      this.setData({
        selectedAddressId: address?.id || "",
        recipientName: address?.recipientName || "",
        phone: address?.phone || "",
        address: address?.address || "",
      });
    } catch (error) {
      if (addressEpoch.valid(n))
        this.setData({
          selectedAddressId: "",
          recipientName: "",
          phone: "",
          address: "",
          addressError: message(error),
        });
    } finally {
      if (addressEpoch.valid(n)) this.setData({ addressLoading: false });
    }
  },
  chooseAddress() {
    if (this.data.busy || this.data.order) return;
    const session = sessionVersion();
    if (!hasSession()) {
      wx.navigateTo({ url: "/pages/login/index" });
      return;
    }
    wx.navigateTo({
      url: `/pages/addresses/index?select=1&selected=${encodeURIComponent(this.data.selectedAddressId)}`,
      events: {
        addressSelected: (selection: { id: string }) => {
          if (isSessionCurrent(session) && !this.data.order)
            this.setData({ selectedAddressId: selection.id, error: "" });
        },
      },
    });
  },
  retryAddress() {
    void this.refreshAddress();
  },
  consentChange(event: WechatMiniprogram.CheckboxGroupChange) {
    if (this.data.busy) return;
    const consent = event.detail.value.includes("yes");
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
    const expected =
      kind === "PRIVACY"
        ? this.data.legal.privacy?.version
        : this.data.legal.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.legal),
      events: {
        legalDocumentLoaded: (document: { kind: string; version: number }) => {
          const current =
            kind === "PRIVACY"
              ? this.data.legal?.privacy?.version
              : this.data.legal?.terms?.version;
          if (
            document.kind === kind &&
            document.version === expected &&
            current === expected
          )
            this.setData({
              [kind === "PRIVACY" ? "privacyRead" : "termsRead"]: true,
            });
        },
      },
    });
  },
  validate(): string {
    if (this.data.addressLoading) return "正在加载收货地址，请稍候";
    if (!this.data.selectedAddressId || this.data.addressError)
      return "请选择已保存的收货地址";
    const name = this.data.recipientName.trim();
    if (name.length < 2 || name.length > 40)
      return "请填写 2–40 字的收货人姓名";
    if (!/^1[3-9]\d{9}$/.test(this.data.phone.trim()))
      return "请填写有效的中国大陆手机号";
    if (
      this.data.address.trim().length < 5 ||
      this.data.address.trim().length > 300
    )
      return "请填写完整收货地址";
    if (!this.data.consent)
      return "请阅读并同意当前隐私政策和用户协议";
    return "";
  },
  async submit() {
    if (this.data.busy || this.data.recoveringOrder || this.data.recoveryError) return;
    if (this.data.order) {
      await this.payExisting();
      return;
    }
    const invalid = this.validate();
    if (invalid || !this.data.product || !this.data.legal) {
      this.setData({ error: invalid || "订单信息尚未准备完成" });
      return;
    }
    if (!this.data.quote || this.data.quoteLoading || !isSessionCurrent(this.data.quoteSession)
        || !validShopQuote(this.data.quote, this.data.id, this.data.quantity)) {
      this.setData({ error: "请重新获取当前账号的价格并确认" });
      return;
    }
    const expectedTotalCents = this.data.quote.totalCents;
    this.setData({ busy: true, error: "" });
    const current = epoch.next();
    const session = sessionVersion();
    let sent = false;
    try {
      await requireSession();
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      const versions = versionsOf(this.data.legal);
      const latest = await currentLegal();
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({
          legal: latest,
          consent: false,
          privacyRead: false,
          termsRead: false,
        });
        throw new Error("协议版本已更新，请重新阅读并确认");
      }
      const user = await getCurrentUser();
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      const requestId = checkoutRequestId(
        user.id,
        this.data.id,
        this.data.quantity,
      );
      // Resolve any previous timeout before sending changed form data or paying.
      try {
        const existing = await request<Order>(
          `/orders/by-request/${requestId}`,
        );
        if (!epoch.valid(current) || !isSessionCurrent(session)) return;
        this.showOrder(existing);
        this.setData({ recoveredOrder: true, awaitingConfirmation: false });
        finishCheckoutIntent(
          user.id,
          this.data.id,
          this.data.quantity,
          requestId,
        );
        return;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      const addresses = await request<{ items: ShippingAddress[] }>(
        "/me/addresses",
      );
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      const selected = addresses.items.find(
        (item) => item.id === this.data.selectedAddressId,
      );
      if (!selected) {
        this.setData({
          selectedAddressId: "",
          recipientName: "",
          phone: "",
          address: "",
        });
        throw new Error("收货地址已删除，请重新选择");
      }
      if (
        selected.recipientName !== this.data.recipientName ||
        selected.phone !== this.data.phone ||
        selected.address !== this.data.address
      ) {
        this.setData({
          recipientName: selected.recipientName,
          phone: selected.phone,
          address: selected.address,
        });
        throw new Error("收货地址已更新，请核对后重新提交");
      }
      sent = true;
      const order = await request<Order>("/orders", "POST", {
        requestId,
        expectedTotalCents,
        items: [{ productId: this.data.id, quantity: this.data.quantity }],
        recipientName: this.data.recipientName.trim(),
        phone: this.data.phone.trim(),
        address: this.data.address.trim(),
        ...versions,
      });
      if (!order?.id) throw new Error("订单创建结果异常，请在我的订单中核对");
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      this.showOrder(order);
      finishCheckoutIntent(
        user.id,
        this.data.id,
        this.data.quantity,
        requestId,
      );
      if (order.status !== "PENDING_PAYMENT") return;
      this.setData({ awaitingConfirmation: true });
      const paidOrder = await payOrder(order.id, () => epoch.valid(current));
      if (epoch.valid(current) && isSessionCurrent(session))
        this.showOrder(paidOrder);
    } catch (error) {
      if (epoch.valid(current) && isSessionCurrent(session)) {
        if (error instanceof ApiError && error.code === "PRICE_CHANGED") {
          await this.refreshQuote();
          if (!epoch.valid(current) || !isSessionCurrent(session)) return;
          this.setData({error:"价格已变化，请核对最新价格后再次提交",awaitingConfirmation:false});
          return;
        }
        if (
          error instanceof ApiError &&
          ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(error.code)
        ) {
          this.setData({
            legal: null,
            consent: false,
            privacyRead: false,
            termsRead: false,
          });
          try {
            const legal = await currentLegal();
            if (!epoch.valid(current) || !isSessionCurrent(session)) return;
            this.setData({ legal });
          } catch (_) {
            // Keep an explicit retry available if the current documents cannot load.
          }
          if (!epoch.valid(current) || !isSessionCurrent(session)) return;
        }
        this.setData({
          error:
            error instanceof ApiError && error.code === "IDEMPOTENCY_CONFLICT"
              ? "此前提交已被记录，请再次点击提交以找回原订单，或到我的订单核对；不会重复创建。"
              : message(error),
          awaitingConfirmation: false,
          ...(sent && !this.data.order && (!(error instanceof ApiError) ||
            error.code === "IDEMPOTENCY_CONFLICT" || error.status === 0 || error.status === 408 ||
            (error.status >= 500 && error.code !== "LEGAL_NOT_READY"))
            ? { recoveryError: "订单提交结果待核对，请先查找原订单。" } : {}),
        });
      }
    } finally {
      if (epoch.valid(current)) this.setData({ busy: false });
    }
  },
  async payExisting() {
    if (
      this.data.busy ||
      !this.data.order ||
      this.data.order.status !== "PENDING_PAYMENT"
    )
      return;
    this.setData({ busy: true, error: "", awaitingConfirmation: true });
    const current = epoch.next();
    const session = sessionVersion();
    try {
      const order = await payOrder(this.data.order.id, () =>
        epoch.valid(current),
      );
      if (epoch.valid(current) && isSessionCurrent(session))
        this.showOrder(order);
    } catch (error) {
      if (epoch.valid(current))
        this.setData({ error: message(error), awaitingConfirmation: false });
    } finally {
      if (epoch.valid(current)) this.setData({ busy: false });
    }
  },
  showOrder(order: Order) {
    this.setData({
      order,
      orderTotalText: money(order.totalCents),
      orderOriginalTotalText: money(order.originalTotalCents ?? order.totalCents),
      orderStatusText: orderStatusLabel(order.status),
      orderDeadlineText: order.expiresAt ? dateLabel(order.expiresAt) : "",
    });
  },
  async reconcilePayment() {
    const pending = this.data.order;
    if (pending?.status !== "PENDING_PAYMENT" || this.data.busy
      || !(pending.paymentInitiated || pending.reconciliationRequired)) return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      const order = await verifyPayment(pending.id, () => epoch.valid(current));
      if (epoch.valid(current) && isSessionCurrent(session))
        this.showOrder(order);
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ busy: false });
    }
  },
  orders() {
    wx.redirectTo({ url: "/pages/orders/index" });
  },
});
