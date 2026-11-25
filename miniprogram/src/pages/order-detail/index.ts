import { request, hasSession, mediaUrl, sessionVersion, isSessionCurrent } from "../../utils/api";
import { Order } from "../../utils/models";
import { message, dateLabel, RequestEpoch, safeId } from "../../utils/domain";
import { money, orderStatusLabel, payOrder } from "../../utils/shop";
import { ActivityOrder, activityOrderStatus } from "../../utils/activity-orders";
import { enterPage } from "../../utils/page-motion";

/**
 * 订单详情：微信「电商订单（订单中心）」深链落地页。
 * 支持三种进入方式：订单号深链（微信订单中心，no=商户订单号&channel=1）、
 * 订单 id + type（小程序内跳转）、仅有 id（默认按装备订单解析）。
 * 装备订单已发货且未确认收货时，提供微信官方 weappOrderConfirm 确认收货组件；
 * 服务端以微信 get_order 复核后才落库，组件回调不可伪造。
 */
const epoch = new RequestEpoch();

type Resolved = { type: "shop" | "activity"; id: string };

type ShopItemView = {
  id: string;
  productName: string;
  productId: string;
  imageUrl: string;
  quantityText: string;
  priceText: string;
  tierName: string;
};

type ShopView = {
  kind: "shop";
  order: Order;
  statusText: string;
  totalText: string;
  originalTotalText: string;
  hasDiscount: boolean;
  dateText: string;
  shippedText: string;
  receiptText: string;
  canConfirmReceipt: boolean;
  items: ShopItemView[];
};

type ActivityView = {
  kind: "activity";
  order: ActivityOrder;
  statusText: string;
  totalText: string;
  dateText: string;
};

type DetailView = ShopView | ActivityView;

Page({
  data: {
    pageMotionClass: "",
    loggedIn: false,
    loading: true,
    error: "",
    busy: false,
    detail: null as DetailView | null,
    confirmError: "",
  },
  orderId: "",
  orderType: "" as "" | "shop" | "activity",

  onLoad(query: Record<string, string | undefined>) {
    const no = (
      query.no ||
      query.merchant_trade_no ||
      query.transaction_id ||
      ""
    ).trim();
    const id = (query.id || "").trim();
    const type = (query.type || (no ? "" : "shop")) as "" | "shop" | "activity";
    // 微信订单中心深链（no=商户订单号）与发货/确认收货服务通知跳转（merchant_trade_no/transaction_id）。
    if (id) {
      this.orderId = id;
      this.orderType = type === "activity" ? "activity" : "shop";
    } else if (no) {
      this.pendingNo = no;
      this.orderType = "";
    }
  },
  pendingNo: "",

  onShow() {
    enterPage(this);
    this.setData({ loggedIn: hasSession() });
    void this.load();
  },
  onHide() {
    epoch.invalidate();
    this.setData({ busy: false });
  },
  onUnload() {
    epoch.invalidate();
  },

  retry() {
    void this.load();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  backToList() {
    const kind = this.data.detail?.kind || this.orderType;
    const route = kind === "activity" ? "pages/activity-orders/index" : "pages/orders/index";
    const previous = typeof getCurrentPages === "function" ? getCurrentPages().slice(-2, -1)[0] : undefined;
    if (previous?.route === route) wx.navigateBack();
    else wx.redirectTo({ url: "/" + route });
  },

  openAfterSales() {
    const detail = this.data.detail;
    const id = safeId(detail?.order.id);
    if (!id || !hasSession() || this.data.busy || detail?.kind !== "shop"
      || !["PAID", "REFUNDED"].includes(detail.order.status)) return;
    const previous = typeof getCurrentPages === "function" ? getCurrentPages().slice(-2, -1)[0] : undefined;
    const channel = this.getOpenerEventChannel?.();
    if (previous?.route === "pages/orders/index" && channel?.emit) {
      channel.emit("afterSales");
      wx.navigateBack();
    } else {
      wx.redirectTo({ url: "/pages/orders/index?afterSales=" + id });
    }
  },

  copyNumber(event: WechatMiniprogram.TouchEvent) {
    const order = this.data.detail?.order;
    if (!order || !hasSession()) return;
    const kind = event.currentTarget.dataset.kind;
    const value = kind === "order" ? order.orderNo
      : kind === "payment" ? order.paymentTransactionId
      : kind === "tracking" && "shippingTrackingNo" in order ? order.shippingTrackingNo : "";
    if (value) wx.setClipboardData({ data: value });
  },
  openProduct(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/product/index?id=" + id });
  },
  async payShopOrder() {
    const detail = this.data.detail;
    if (this.data.busy || detail?.kind !== "shop" || detail.order.status !== "PENDING_PAYMENT") return;
    const session = sessionVersion(), n = epoch.next();
    const current = () => epoch.valid(n) && isSessionCurrent(session);
    this.setData({ busy: true, confirmError: "" });
    try {
      const order = await payOrder(detail.order.id, current);
      if (!current()) return;
      this.setData({ detail: this.shopView(order) });
      this.getOpenerEventChannel?.()?.emit?.("orderUpdated", order);
      if (order.status === "PENDING_PAYMENT") this.setData({ confirmError: "支付结果尚未确认，请勿重复付款。" });
      else if (order.status === "PAID") wx.showToast({ title: "付款已确认", icon: "success" });
    } catch (error) {
      if (current()) this.setData({ confirmError: message(error) });
    } finally {
      if (current()) this.setData({ busy: false });
    }
  },
  async cancelShopOrder() {
    const detail = this.data.detail;
    if (this.data.busy || detail?.kind !== "shop" ||
        !["PENDING_PAYMENT", "CONFIRMED_FREE"].includes(detail.order.status)) return;
    const session = sessionVersion(), n = epoch.next();
    const current = () => epoch.valid(n) && isSessionCurrent(session);
    this.setData({ busy: true, confirmError: "" });
    try {
      const answer = await wx.showModal({
        title: "取消订单？", content: "服务端确认取消后将释放库存。", confirmText: "取消订单",
      });
      if (!answer.confirm || !current()) return;
      const order = await request<Order>("/orders/" + encodeURIComponent(detail.order.id) + "/cancel", "POST");
      if (!current()) return;
      this.setData({ detail: this.shopView(order) });
      this.getOpenerEventChannel?.()?.emit?.("orderUpdated", order);
      if (order.status === "CANCELLED") wx.showToast({ title: "订单已取消", icon: "success" });
    } catch (error) {
      if (current()) this.setData({ confirmError: message(error) });
    } finally {
      if (current()) this.setData({ busy: false });
    }
  },
  async load() {
    if (this.data.busy) return;
    const attempt = epoch.next();
    this.setData({ loading: true, error: "", confirmError: "" });
    if (!hasSession()) {
      this.setData({ loading: false, loggedIn: false, detail: null });
      return;
    }
    const session = sessionVersion();
    const current = () => epoch.valid(attempt) && isSessionCurrent(session);
    this.setData({ loggedIn: true });
    try {
      if (!this.orderId && this.pendingNo) {
        const resolved = await request<Resolved>(
          `/order-center/resolve?no=${encodeURIComponent(this.pendingNo)}`,
        );
        if (!current()) return;
        this.orderId = resolved.id;
        this.orderType = resolved.type;
      }
      if (!this.orderId) throw new Error("缺少订单号");
      if (this.orderType === "activity") {
        const order = await request<ActivityOrder>(`/activity-orders/${this.orderId}`);
        if (!current()) return;
        this.setData({
          detail: {
            kind: "activity",
            order,
            statusText: activityOrderStatus(order.status),
            totalText: money(order.totalCents),
            dateText: dateLabel(order.expiresAt),
          },
        });
      } else {
        const order = await request<Order>(`/orders/${this.orderId}`);
        if (!current()) return;
        this.setData({ detail: this.shopView(order) });
      }
    } catch (error) {
      if (current())
        this.setData({ error: message(error), detail: null });
    } finally {
      if (current()) this.setData({ loading: false });
    }
  },

  shopView(order: Order): ShopView {
    const original = order.originalTotalCents ?? order.totalCents;
    return {
      kind: "shop",
      order,
      statusText: orderStatusLabel(order.status),
      totalText: money(order.totalCents),
      originalTotalText: money(original),
      hasDiscount: original > order.totalCents,
      dateText: dateLabel(order.createdAt),
      shippedText: order.shippedAt ? dateLabel(order.shippedAt) : "",
      receiptText: order.receiptConfirmedAt ? dateLabel(order.receiptConfirmedAt) : "",
      canConfirmReceipt:
        order.status === "SHIPPED" &&
        !order.receiptConfirmedAt &&
        !!order.paymentTransactionId,
      items: (order.items || []).map((item) => ({
        id: item.id,
        productName: item.productName,
        productId: item.productId,
        imageUrl: mediaUrl(item.imageUrl || ""),
        quantityText: `× ${item.quantity}`,
        priceText: money(item.priceCents),
        tierName: item.tierName || "",
      })),
    };
  },

  /** 微信官方确认收货组件；success 后调服务端（服务端再以 get_order 复核）。 */
  confirmReceipt() {
    if (this.data.busy) return;
    const detail = this.data.detail;
    if (!detail || detail.kind !== "shop" || !detail.canConfirmReceipt) return;
    const transactionId = detail.order.paymentTransactionId || "";
    if (!transactionId) return;
    this.setData({ busy: true, confirmError: "" });
    wx.openBusinessView({
      businessType: "weappOrderConfirm",
      extraData: { transaction_id: transactionId },
      success: (res) => {
        // 官方组件以 extraData.status 回传业务结果：success 才发起服务端复核
        const status = res && res.extraData && res.extraData.status;
        if (status === "success") {
          void this.submitReceiptConfirmation();
        } else {
          this.setData({ busy: false });
        }
      },
      fail: () => {
        this.setData({ busy: false, confirmError: "未能打开微信确认收货组件，请稍后重试" });
      },
    });
  },

  async submitReceiptConfirmation() {
    const detail = this.data.detail;
    if (!detail || detail.kind !== "shop") return;
    const current = epoch.next();
    try {
      await request<{ orderId: string; receiptConfirmed: boolean }>(
        `/order-center/orders/${detail.order.id}/confirm-receipt`,
        "POST",
      );
      if (!epoch.valid(current)) return;
      const order = await request<Order>(`/orders/${detail.order.id}`);
      if (!epoch.valid(current)) return;
      this.setData({ detail: this.shopView(order), busy: false });
      this.getOpenerEventChannel?.()?.emit?.("orderUpdated", order);
      wx.showToast({ title: "已确认收货", icon: "success" });
    } catch (error) {
      if (epoch.valid(current))
        this.setData({ busy: false, confirmError: message(error) });
    }
  },

});
