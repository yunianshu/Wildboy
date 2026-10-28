import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { Order, PageResult } from "../../utils/models";
import { message, safeId, mergeUnique } from "../../utils/domain";
import { requireAdmin, maskPhone } from "../admin-editor/shared";
import { adminOrderStatus, adminMoney } from "../../utils/admin-shop";
type Row = Order & { statusLabel: string; money: string; phoneMasked: string };
Page({
  data: {
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
    revealedId: "",
    query: "",
    statuses: [
      { value: "", label: "全部" },
      { value: "PENDING_PAYMENT", label: "待付款" },
      { value: "PAID", label: "待发货" },
      { value: "SHIPPED", label: "已发货" },
      { value: "CANCELLED", label: "已取消" },
    ],
  },
  _epoch: 0,
  _session: -1,
  onShow() {
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
    });
  },
  onUnload() {
    this._epoch++;
  },
  onReachBottom() {
    void this.load(false);
  },
  async load(reset = true) {
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
      if (n === this._epoch)
        this.setData({
          error: message(e),
          ...(!isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403))
            ? { authorized: false, items: [] }
            : {}),
        });
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
    void this.load(true);
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
    this.setData({ pendingId: "", pendingConfirmed: false });
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
    const id = safeId(e.currentTarget.dataset.id),
      row = this.data.items.find((x) => x.id === id);
    if (!row || row.status !== "PAID") return;
    const n = this._epoch,
      s = this._session;
    this.setData({ busyId: id, error: "" });
    try {
      if (this.data.pendingId !== id || !this.data.pendingConfirmed) {
        this.setData({ pendingId: id, pendingConfirmed: false });
        return;
      }
      this.setData({ pendingId: "", pendingConfirmed: false });
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      await request(`/admin/orders/${id}/ship`, "POST", {
        version: row.version,
      });
      if (n !== this._epoch || !isSessionCurrent(s)) return;
      this.setData({ busyId: "" });
      await this.load(true);
    } catch (e) {
      if (n === this._epoch)
        this.setData({
          error:
            e instanceof ApiError && e.status === 409
              ? "订单状态已变化，请刷新核对后再操作"
              : message(e),
          ...(!isSessionCurrent(s) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403))
            ? { authorized: false, items: [], revealedId: "" }
            : {}),
        });
    } finally {
      if (n === this._epoch) this.setData({ busyId: "" });
    }
  },
});
