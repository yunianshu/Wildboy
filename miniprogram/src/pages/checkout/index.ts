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

const epoch = new RequestEpoch();
const addressEpoch = new RequestEpoch();
Page({
  data: {
    id: "",
    session: -1,
    quantity: 1,
    product: null as Product | null,
    totalText: "",
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
    orderStatusText: "",
    orderDeadlineText: "",
    awaitingConfirmation: false,
    recoveredOrder: false,
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
    this.setData({ id, quantity, session: sessionVersion() });
    if (id) void this.load();
    else this.setData({ loading: false, error: "商品链接无效" });
  },
  onShow() {
    if (this.data.session !== -1 && this.data.session !== sessionVersion()) {
      epoch.invalidate();
      this.setData({
        session: sessionVersion(),
        selectedAddressId: "",
        addressLoading: false,
        addressError: "",
        recipientName: "",
        phone: "",
        address: "",
        order: null,
        consent: false,
        privacyRead: false,
        termsRead: false,
        busy: false,
        error: "账号已改变，请重新确认收货信息",
      });
    }
    if (this.data.loading) void this.load();
    if (!this.data.order) void this.refreshAddress();
  },
  onHide() {
    epoch.invalidate();
    addressEpoch.invalidate();
    this.setData({ busy: false });
  },
  onUnload() {
    epoch.invalidate();
    addressEpoch.invalidate();
  },
  async load() {
    const current = epoch.next();
    this.setData({ loading: true, error: "" });
    const session = sessionVersion();
    try {
      if (hasSession()) {
        const user = await getCurrentUser();
        if (!epoch.valid(current) || !isSessionCurrent(session)) return;
        const pendingId = pendingCheckoutRequestId(
          user.id,
          this.data.id,
          this.data.quantity,
        );
        if (pendingId) {
          try {
            const order = await request<Order>(
              `/orders/by-request/${pendingId}`,
            );
            if (!epoch.valid(current) || !isSessionCurrent(session)) return;
            this.showOrder(order);
            this.setData({ recoveredOrder: true, awaitingConfirmation: false });
            finishCheckoutIntent(
              user.id,
              this.data.id,
              this.data.quantity,
              pendingId,
            );
            return;
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 404))
              throw error;
          }
        }
      }
      const [product, legal] = await Promise.all([
        request<Product>(`/shop/products/${this.data.id}`),
        currentLegal(),
      ]);
      if (!epoch.valid(current)) return;
      if (this.data.quantity > product.stock) {
        this.setData({
          error: "购买数量超过当前库存；如之前已提交，请先核对我的订单",
        });
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
    const session = sessionVersion();
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
      const order = await request<Order>("/orders", "POST", {
        requestId,
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
      if (epoch.valid(current)) {
        if (
          error instanceof ApiError &&
          ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(error.code)
        )
          this.setData({
            legal: null,
            consent: false,
            privacyRead: false,
            termsRead: false,
          });
        this.setData({
          error:
            error instanceof ApiError && error.code === "IDEMPOTENCY_CONFLICT"
              ? "此前提交已被记录，请再次点击提交以找回原订单，或到我的订单核对；不会重复创建。"
              : message(error),
          awaitingConfirmation: false,
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
      orderStatusText: orderStatusLabel(order.status),
      orderDeadlineText: order.expiresAt ? dateLabel(order.expiresAt) : "",
    });
  },
  async refreshOrder() {
    if (!this.data.order || this.data.busy) return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      const order = await verifyPayment(this.data.order.id, () => epoch.valid(current));
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
