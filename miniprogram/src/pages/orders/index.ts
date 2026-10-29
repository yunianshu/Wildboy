import {
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Order, PageResult } from "../../utils/models";
import { message, safeId, dateLabel, RequestEpoch } from "../../utils/domain";
import { money, orderStatusLabel, payOrder, verifyPayment } from "../../utils/shop";

const epoch = new RequestEpoch();
type OrderView = Order & {
  statusText: string;
  totalText: string;
  dateText: string;
  deadlineText: string;
};
Page({
  data: {
    loggedIn: false,
    items: [] as OrderView[],
    loading: true,
    loadingMore: false,
    page: 0,
    hasMore: false,
    selected: "",
    filters: [
      { code: "", name: "全部" },
      { code: "PENDING_PAYMENT", name: "待支付" },
      { code: "PAID", name: "待发货" },
      { code: "SHIPPED", name: "已发货" },
      { code: "CANCELLED", name: "已取消" },
    ],
    busyId: "",
    error: "",
  },
  onShow() {
    this.setData({ loggedIn: hasSession() });
    void this.load();
  },
  onHide() {
    epoch.invalidate();
    this.setData({ items: [], busyId: "" });
  },
  onReachBottom() {
    void this.load(false);
  },
  select(event: WechatMiniprogram.TouchEvent) {
    const selected = event.currentTarget.dataset.code || "";
    if (
      !this.data.filters.some((item) => item.code === selected) ||
      selected === this.data.selected ||
      this.data.busyId
    )
      return;
    this.setData({ selected });
    void this.load();
  },
  more() {
    void this.load(false);
  },
  onUnload() {
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  view(order: Order): OrderView {
    return {
      ...order,
      items: order.items.map((item) => ({ ...item })),
      statusText: orderStatusLabel(order.status),
      totalText: money(order.totalCents),
      dateText: dateLabel(order.createdAt),
      deadlineText: order.expiresAt ? dateLabel(order.expiresAt) : "",
    };
  },
  async load(reset = true) {
    if (
      this.data.busyId ||
      (!reset &&
        (this.data.loading || this.data.loadingMore || !this.data.hasMore))
    )
      return;
    const current = epoch.next();
    const session = sessionVersion();
    const page = reset ? 0 : this.data.page + 1;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: "",
      loggedIn: hasSession(),
      ...(reset ? { items: [], page: 0, hasMore: false } : {}),
    });
    if (!hasSession()) {
      this.setData({ loading: false, loadingMore: false, items: [] });
      return;
    }
    try {
      const result = await request<PageResult<Order>>(
        `/orders?page=${page}&size=20${this.data.selected ? "&status=" + this.data.selected : ""}`,
      );
      if (epoch.valid(current) && isSessionCurrent(session)) {
        const rows = result.items.map((order) => this.view(order));
        const previous = reset ? [] : this.data.items;
        const ids = new Set(previous.map((item) => item.id));
        this.setData({
          items: [...previous, ...rows.filter((item) => !ids.has(item.id))],
          page: result.page,
          hasMore: result.hasMore,
        });
      }
    } catch (error) {
      if (epoch.valid(current))
        this.setData({
          error: message(error),
          ...(!hasSession()
            ? { items: [], loggedIn: false, hasMore: false }
            : {}),
        });
    } finally {
      if (epoch.valid(current))
        this.setData({ loading: false, loadingMore: false });
    }
  },
  updateOrder(order: Order) {
    this.setData({
      items: this.data.items
        .filter(
          (item) =>
            item.id !== order.id ||
            !this.data.selected ||
            order.status === this.data.selected,
        )
        .map((item) => (item.id === order.id ? this.view(order) : item)),
    });
  },
  retry() {
    void this.load();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async pay(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId || this.data.loading || this.data.loadingMore)
      return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await payOrder(id, () => epoch.valid(current));
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      this.updateOrder(order);
      if (order.status === "PENDING_PAYMENT")
        wx.showModal({
          title: "支付结果确认中",
          content: "请稍后下拉刷新订单；不要重复创建新订单。",
          showCancel: false,
        });
    } catch (error) {
      if (epoch.valid(current))
        this.setData({
          error: message(error),
          ...(!hasSession()
            ? { items: [], loggedIn: false, hasMore: false }
            : {}),
        });
    } finally {
      if (epoch.valid(current)) this.setData({ busyId: "" });
    }
  },
  async verify(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId || this.data.loading || this.data.loadingMore) return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await verifyPayment(id, () => epoch.valid(current));
      if (epoch.valid(current) && isSessionCurrent(session)) {
        this.updateOrder(order);
        if (order.status === "PENDING_PAYMENT") this.setData({ error: "尚未确认到账，请稍后刷新，勿重复下单" });
      }
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error), ...(!hasSession() ? {items: [], loggedIn: false, hasMore: false} : {}) });
    } finally {
      if (epoch.valid(current)) this.setData({busyId: ""});
    }
  },
  async cancel(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId || this.data.loading || this.data.loadingMore)
      return;
    const session = sessionVersion();
    const prompt = epoch.next();
    this.setData({ busyId: id });
    let answer;
    try {
      answer = await wx.showModal({
        title: "取消这笔订单？",
        content: "服务端关单成功后会释放库存；已支付订单不能直接取消。",
        confirmText: "确认取消",
      });
    } catch (error) {
      if (epoch.valid(prompt))
        this.setData({ busyId: "", error: message(error) });
      return;
    }
    if (!epoch.valid(prompt) || !isSessionCurrent(session)) return;
    if (!answer.confirm) {
      this.setData({ busyId: "" });
      return;
    }
    const current = epoch.next();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await request<Order>(`/orders/${id}/cancel`, "POST");
      if (epoch.valid(current) && isSessionCurrent(session))
        this.updateOrder(order);
    } catch (error) {
      if (epoch.valid(current))
        this.setData({
          error: message(error),
          ...(!hasSession()
            ? { items: [], loggedIn: false, hasMore: false }
            : {}),
        });
    } finally {
      if (epoch.valid(current)) this.setData({ busyId: "" });
    }
  },
});
