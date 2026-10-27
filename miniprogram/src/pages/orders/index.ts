import { request, hasSession, sessionVersion, isSessionCurrent } from "../../utils/api";
import { Order, PageResult } from "../../utils/models";
import { message, safeId, dateLabel, RequestEpoch } from "../../utils/domain";
import { money, orderStatusLabel, payOrder } from "../../utils/shop";

const epoch = new RequestEpoch();
type OrderView = Order & { statusText: string; totalText: string; dateText: string };
Page({
  data: {
    loggedIn: false,
    items: [] as OrderView[],
    loading: true,
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
    };
  },
  async load() {
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ loading: true, error: "", loggedIn: hasSession() });
    if (!hasSession()) {
      this.setData({ loading: false, items: [] });
      return;
    }
    try {
      const result = await request<PageResult<Order>>("/orders?page=0&size=50");
      if (epoch.valid(current) && isSessionCurrent(session))
        this.setData({ items: result.items.map((order) => this.view(order)) });
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async pay(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId) return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await payOrder(id);
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      this.setData({ items: this.data.items.map((item) => (item.id === id ? this.view(order) : item)) });
      if (order.status !== "PAID")
        wx.showModal({ title: "支付结果确认中", content: "请稍后下拉刷新订单；不要重复创建新订单。", showCancel: false });
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ busyId: "" });
    }
  },
  async cancel(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId) return;
    const answer = await wx.showModal({ title: "取消这笔订单？", content: "服务端关单成功后会释放库存；已支付订单不能直接取消。", confirmText: "确认取消" });
    if (!answer.confirm) return;
    const current = epoch.next();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await request<Order>(`/orders/${id}/cancel`, "POST");
      if (epoch.valid(current))
        this.setData({ items: this.data.items.map((item) => (item.id === id ? this.view(order) : item)) });
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error) });
    } finally {
      if (epoch.valid(current)) this.setData({ busyId: "" });
    }
  },
});
