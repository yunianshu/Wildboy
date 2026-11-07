import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { Order, PageResult } from "../../utils/models";
import { message, safeId, mergeUnique } from "../../utils/domain";
import { requireAdmin, maskPhone } from "../admin-editor/shared";
import { adminOrderStatus, adminMoney } from "../../utils/admin-shop";
type Row = Order & { statusLabel: string; money: string; phoneMasked: string };
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    authorized: false,
    loading: false,
    loadingMore: false,
    error: "",
    items: [] as Row[],
    page: 0,
    hasMore: false,
    status: "",
    busyId: "",
    pendingId: "",
    pendingConfirmed: false,
    pendingOrder: null as Row | null,
    resultOrder: null as Row | null,
    revealedId: "",
    query: "",
    statuses: [
      { value: "", label: "全部" },
      { value: "PENDING_PAYMENT", label: "待付款" },
      { value: "PAID", label: "待发货" },
      { value: "SHIPPED", label: "已发货" },
      { value: "REFUNDED", label: "已退款" },
      { value: "CANCELLED", label: "已取消" },
    ],
  },
  _epoch: 0,
  _session: -1,
  onShow() {
    enterPage(this);
    void this.load(true);
  },
  onHide() {
    this._epoch++;
    this.setData({
      authorized: false,
      items: [],
      revealedId: "",
      loading: false,
      loadingMore: false,
      busyId: "",
      pendingId: "",
      pendingConfirmed: false,
      pendingOrder: null,
      resultOrder: null,
    });
  },
  onUnload() {
    this._epoch++;
  },
  onReachBottom() {
    void this.load(false);
  },
  async load(reset = true) {
    // A queued refresh must never invalidate an active write.
    if (this.data.busyId) return;
    if (
      !reset &&
      (this.data.loading || this.data.loadingMore || !this.data.hasMore)
    )
      return;
    const n = ++this._epoch;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      error: "",
      revealedId: "",
      ...(reset ? { items: [], page: 0 } : {}),
    });
    try {
      const s = await requireAdmin();
      if (n !== this._epoch) return;
      this._session = s;
      const page = reset ? 0 : this.data.page + 1;
      const result = await request<PageResult<Order>>(
        `/admin/orders?page=${page}&size=20${this.data.status ? `&status=${this.data.status}` : ""}`,
      );
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      const rows = result.items.map((x) => ({
        ...x,
        statusLabel: adminOrderStatus(x.status),
        money: adminMoney(x.totalCents),
        phoneMasked: maskPhone(x.phone),
      }));
      this.setData({
        authorized: true,
        items: reset ? rows : mergeUnique(this.data.items, rows),
        page: result.page,
        hasMore: result.hasMore,
      });
    } catch (e) {
      if (n === this._epoch) {
        // A failed page zero leaves nothing to page from: only the retry may
        // re-read page zero before any later page loads.
        const denied =
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        this.setData({
          error: message(e),
          ...(reset ? { hasMore: false } : {}),
          ...(denied
            ? { authorized: false, items: [], revealedId: "" }
            : {}),
        });
      }
    } finally {
      if (n === this._epoch)
        this.setData({ loading: false, loadingMore: false });
    }
  },
  filter(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busyId) return;
    const status = String(e.currentTarget.dataset.status || "");
    if (!this.data.statuses.some((x) => x.value === status)) return;
    this.setData({ status });
    void this.load(true);
  },
  more() {
    void this.load(false);
  },
  retry() {
    void this.load(!this.data.items.length);
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  async reveal(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (
      !id ||
      this.data.busyId ||
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    if (this.data.revealedId === id) {
      this.setData({ revealedId: "" });
      return;
    }
    const n = this._epoch,
      s = this._session;
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      const answer = await wx.showModal({
        title: "显示收件人联系方式？",
        content: "手机号与地址仅用于发货核对，请勿外传。",
      });
      if (!answer.confirm || n !== this._epoch || !isSessionCurrent(s)) return;
      this.setData({ revealedId: id });
    } catch (e) {
      if (n === this._epoch)
        this.setData({
          authorized: false,
          items: [],
          revealedId: "",
          error: message(e),
        });
    }
  },
  cancelShip() {
    this.setData({ pendingId: "", pendingConfirmed: false, pendingOrder: null });
  },
  confirmShip() {
    if (!this.data.pendingId) return;
    this.setData({ pendingConfirmed: true });
    return this.ship({
      currentTarget: { dataset: { id: this.data.pendingId } },
    } as unknown as WechatMiniprogram.TouchEvent);
  },
  async ship(e: WechatMiniprogram.TouchEvent) {
    if (
      this.data.busyId ||
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    const id = safeId(e.currentTarget.dataset.id);
    const n = this._epoch,
      s = this._session;
    if (this.data.pendingId !== id || !this.data.pendingConfirmed) {
      const row = this.data.items.find((x) => x.id === id);
      if (!row || row.status !== "PAID") return;
      if (row.reconciliationRequired) {
        this.setData({
          error: "该订单存在待核对的售后或对账，处理完成前不能发货。",
        });
        return;
      }
      // The confirmation is only valid for the exact displayed snapshot.
      this.setData({
        pendingId: id,
        pendingConfirmed: false,
        pendingOrder: { ...row },
      });
      return;
    }
    const snapshot = this.data.pendingOrder;
    const current = this.data.items.find((x) => x.id === id);
    this.setData({
      pendingId: "",
      pendingConfirmed: false,
      pendingOrder: null,
    });
    if (!snapshot || !current || current.version !== snapshot.version) {
      this.setData({ error: "订单已变化，请重新核对后再操作" });
      return;
    }
    this.setData({ busyId: id, error: "" });
    try {
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      const result = await request<Order>(`/admin/orders/${id}/ship`, "POST", {
        version: current.version,
      });
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      if (!result || result.status !== "SHIPPED") {
        this.setData({
          error: "服务器尚未确认发货结果，请刷新订单核对后再试",
          busyId: "",
        });
        return;
      }
      this.setData({
        resultOrder: {
          ...result,
          statusLabel: adminOrderStatus(result.status),
          money: adminMoney(result.totalCents),
          phoneMasked: maskPhone(result.phone),
        },
        busyId: "",
      });
      await this.load(true);
    } catch (e) {
      if (n === this._epoch) {
        // A refund block has its own accurate reason; do not suggest a stale version.
        const refundBlock =
          e instanceof ApiError && e.code === "REFUND_PENDING";
        this.setData({
          error: refundBlock
            ? message(e)
            : e instanceof ApiError && e.status === 409
              ? "订单状态已变化，请刷新核对后再操作"
              : message(e),
          ...(!isSessionCurrent(s) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403))
            ? { authorized: false, items: [], revealedId: "" }
            : {}),
        });
      }
    } finally {
      if (n === this._epoch) this.setData({ busyId: "" });
    }
  },
});
