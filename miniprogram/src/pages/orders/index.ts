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
type Refund = { id:string; orderId:string; status:string; reason:string; decisionNote:string; lastError:string; amountCents:number };
const refundLabels:Record<string,string>={REQUESTED:"待审核",REJECTED:"已拒绝",PROCESSING:"退款中",UNKNOWN:"结果待核对",SUCCESS:"已退款",ABNORMAL:"退款异常",CLOSED:"退款关闭"};
// 只有终态且未成功的退款（被拒绝/被微信关闭）允许重新提交；进行中或已退款不得重复申请。
const refundReRequestable = (record: Refund | null) =>
  !record || record.status === "REJECTED" || record.status === "CLOSED";
type OrderView = Order & {
  statusText: string;
  totalText: string;
  originalTotalText: string;
  dateText: string;
  deadlineText: string;
};
import { enterPage } from "../../utils/page-motion";

Page({
  _listSession: -1,
  _listLoaded: false,
  _afterSalesId: "",
  data: {
    pageMotionClass: "",
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
      { code: "CONFIRMED_FREE", name: "免支付待发货" },
      { code: "SHIPPED", name: "已发货" },
      { code: "CANCELLED", name: "已取消" },
      { code: "REFUNDED", name: "已退款" },
    ],
    busyId: "",
    refundOrderId: "", refundRecord: null as Refund | null, refundReRequestable: false, refundAmountText: "", refundStatusText: "", refundReason: "", refundError: "",
    error: "",
  },
  onLoad(query: Record<string, string | undefined>) {
    this._afterSalesId = safeId(query.afterSales);
  },
  _showGeneration: 0,
  async onShow() {
    enterPage(this);
    this._showGeneration++;
    const session = sessionVersion();
    const loggedIn = hasSession();
    if (this._listSession !== session || !loggedIn) {
      this._listSession = session;
      this._listLoaded = false;
      this.setData({ items: [], page: 0, hasMore: false });
    }
    this.setData({ loggedIn });
    if (!loggedIn) return;
    const refreshing = this.load(true, this._listLoaded);
    const visit = this._showGeneration;
    await refreshing;
    if (visit !== this._showGeneration || !isSessionCurrent(session)) return;
    if (!this._afterSalesId) { await this.reconcilePending(); return; }
    const id = this._afterSalesId;
    this._afterSalesId = "";
    await this.loadRefund(id);
  },
  onHide() {
    this._showGeneration++;
    this._afterSalesId = "";
    epoch.invalidate();
    this.setData({ loading: false, loadingMore: false, busyId: "", refundOrderId:"",refundRecord:null,refundReRequestable:false,refundAmountText:"",refundReason:"",refundError:"" });
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
    this._showGeneration++;
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
      originalTotalText: money(order.originalTotalCents ?? order.totalCents),
      dateText: dateLabel(order.createdAt),
      deadlineText: order.expiresAt ? dateLabel(order.expiresAt) : "",
    };
  },
  async load(reset = true, background = false) {
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
      loading: reset && !background,
      loadingMore: !reset,
      error: "",
      loggedIn: hasSession(),
      ...(reset && !background ? { items: [], page: 0, hasMore: false } : {}),
    });
    if (!hasSession()) {
      this.setData({ loading: false, loadingMore: false, items: [] });
      return;
    }
    try {
      const status = this.data.selected ? "&status=" + this.data.selected : "";
      const pages = background ? Array.from({ length: this.data.page + 1 }, (_, i) => i) : [page];
      const results = await Promise.all(pages.map((index) => request<PageResult<Order>>(
        "/orders?page=" + index + "&size=20" + status,
      )));
      const result = results[results.length - 1];
      if (epoch.valid(current) && isSessionCurrent(session)) {
        this._listLoaded = true;
        this._listSession = session;
        const rows = results.flatMap((result) => result.items.map((order) => this.view(order)));
        const previous = reset ? [] : this.data.items;
        const distinct = new Map([...previous, ...rows].map((item) => [item.id, item]));
        this.setData({
          items: [...distinct.values()],
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
  openDetail(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busyId || this.data.loading) return;
    const id = safeId(event.currentTarget.dataset.id);
    if (!id) return;
    const session = sessionVersion();
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${id}&type=shop`,
      events: {
        orderUpdated: (order: Order) => {
          if (isSessionCurrent(session) && order.id === id) this.updateOrder(order);
        },
        afterSales: () => {
          if (isSessionCurrent(session)) this._afterSalesId = id;
        },
      },
    });
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async pay(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId || this.data.loading || this.data.loadingMore)
      return;
    if (this.data.items.find(x => x.id === id)?.status !== "PENDING_PAYMENT") return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await payOrder(id, () => epoch.valid(current));
      if (!epoch.valid(current) || !isSessionCurrent(session)) return;
      this.updateOrder(order);
      if (order.status === "PAID") wx.showToast?.({ title: "付款已确认", icon: "success" });
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
  async reconcilePending() {
    if (this.data.busyId || this.data.loading || this.data.loadingMore || this.data.refundOrderId) return;
    const id = this.data.items.find((item) =>
      item.status === "PENDING_PAYMENT" && (item.paymentInitiated || item.reconciliationRequired)
    )?.id;
    if (!id) return;
    const current = epoch.next();
    const session = sessionVersion();
    this.setData({ busyId: id, error: "" });
    try {
      const order = await verifyPayment(id, () => epoch.valid(current));
      if (epoch.valid(current) && isSessionCurrent(session)) {
        this.updateOrder(order);
        if (order.status === "PENDING_PAYMENT") this.setData({ error: "暂未确认到账，请勿重复下单" });
      }
    } catch (error) {
      if (epoch.valid(current)) this.setData({ error: message(error), ...(!hasSession() ? {items: [], loggedIn: false, hasMore: false} : {}) });
    } finally {
      if (epoch.valid(current)) this.setData({busyId: ""});
    }
  },
  async openRefund(event:WechatMiniprogram.TouchEvent) {
    await this.loadRefund(safeId(event.currentTarget.dataset.id));
  },
  async loadRefund(id: string) {
    if (!id || !hasSession() || this.data.busyId || this.data.loading || this.data.loadingMore) return;
    const current=epoch.next(),session=sessionVersion();
    this.setData({busyId:id,error:""});
    try {
      const record=await request<Refund|null>(`/orders/${id}/refund`);
      if(epoch.valid(current)&&isSessionCurrent(session))this.setData({refundOrderId:id,refundRecord:record,refundReRequestable:refundReRequestable(record),refundAmountText:record&&Number.isFinite(record.amountCents)?`¥${(record.amountCents/100).toFixed(2)}`:"",refundStatusText:record?refundLabels[record.status]||record.status:"",refundReason:"",refundError:""});
    } catch(error){if(epoch.valid(current))this.setData({error:message(error),...(!hasSession()?{items:[],loggedIn:false}:{})});}
    finally{if(epoch.valid(current))this.setData({busyId:""});}
  },
  refundInput(event:WechatMiniprogram.Input){if(!this.data.busyId)this.setData({refundReason:event.detail.value,refundError:""});},
  closeRefund(){if(!this.data.busyId)this.setData({refundOrderId:"",refundRecord:null,refundReRequestable:false,refundAmountText:"",refundReason:"",refundError:""});},
  stopRefundEvent(){},
  async requestRefund(){
    const id=this.data.refundOrderId,reason=this.data.refundReason.trim();
    // 进行中（待审核/退款中/待核对/异常）或已退款的申请禁止重复提交；被拒绝/已关闭可重申。
    if(!id||this.data.busyId||this.data.loading||this.data.loadingMore||!refundReRequestable(this.data.refundRecord))return;
    if(!reason||reason.length>200){this.setData({refundError:"请填写退款原因"});return;}
    const current=epoch.next(),session=sessionVersion();this.setData({busyId:id,refundError:""});
    try {
      const record=await request<Refund>(`/orders/${id}/refund`,"POST",{reason});
      if (epoch.valid(current) && isSessionCurrent(session)) {
        this.setData({refundRecord:record,refundReRequestable:refundReRequestable(record),refundStatusText:refundLabels[record.status]||record.status,refundReason:""});
        wx.showToast?.({ title: "申请已提交", icon: "success" });
      }
    } catch(error){if(epoch.valid(current))this.setData({refundError:message(error),...(!hasSession()?{items:[],loggedIn:false,refundOrderId:"",refundRecord:null,refundReRequestable:false}:{})});}
    finally{if(epoch.valid(current))this.setData({busyId:""});}
  },
  async cancel(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (!id || this.data.busyId || this.data.loading || this.data.loadingMore)
      return;
    const row=this.data.items.find(x=>x.id===id);
    if(!row || !["PENDING_PAYMENT","CONFIRMED_FREE"].includes(row.status)) return;
    const session = sessionVersion();
    const prompt = epoch.next();
    this.setData({ busyId: id });
    let answer;
    try {
      answer = await wx.showModal({
        title: "取消这笔订单？",
        content: row.status === "CONFIRMED_FREE" ? "取消这笔免支付订单后释放库存，不涉及支付退款。" : "服务端关单成功后会释放库存；已支付订单不能直接取消。",
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
