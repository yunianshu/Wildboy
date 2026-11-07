import { request, isSessionCurrent, mediaUrl, ApiError } from "../../utils/api";
import { Activity, PageResult } from "../../utils/models";
import { message, dateLabel, safeId, mergeUnique } from "../../utils/domain";
import { requireAdmin, statusLabel } from "../admin-editor/shared";
type Row = Activity & {
  cover: string;
  dateText: string;
  statusText: string;
  editable: boolean;
};
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    authorized: false,
    loading: false,
    loadingMore: false,
    busyId: "",
    pendingId: "",
    pendingAction: "",
    pendingConfirmed: false,
    pendingItem: null as Row | null,
    resultItem: null as Row | null,
    error: "",
    items: [] as Row[],
    page: 0,
    hasMore: false,
    status: "",
    statuses: [
      { value: "", label: "全部" },
      { value: "DRAFT", label: "草稿" },
      { value: "PUBLISHED", label: "已发布" },
      { value: "CANCELLED", label: "已取消" },
    ],
  },
  _epoch: 0,
  _visible: true as boolean,
  _session: -1,
  onShow() {
    enterPage(this);
    this._visible = true;
    void this.load(true);
  },
  onHide() {
    // Hiding invalidates in-flight reads so a hidden list can never repopulate.
    this._epoch++;
    this._visible = false;
    this.setData({
      authorized: false,
      items: [],
      loading: false,
      loadingMore: false,
      busyId: "",
      pendingId: "",
      pendingAction: "",
      pendingConfirmed: false,
      pendingItem: null,
      resultItem: null,
    });
  },
  onUnload() {
    this._epoch++;
  },
  onReachBottom() {
    void this.load(false);
  },
  onPullDownRefresh() {
    void this.load(true).finally(() => wx.stopPullDownRefresh());
  },
  async load(reset = true) {
    // An in-flight write must never be invalidated by a queued refresh.
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
      ...(reset ? { items: [], page: 0 } : {}),
    });
    try {
      const session = await requireAdmin();
      if (n !== this._epoch) return;
      this._session = session;
      this.setData({ authorized: true });
      const page = reset ? 0 : this.data.page + 1;
      const result = await request<PageResult<Activity>>(
        `/admin/activities?page=${page}&size=20${this.data.status ? `&status=${this.data.status}` : ""}`,
      );
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      const rows = result.items.map((x) => ({
        ...x,
        cover: mediaUrl(x.coverUrl),
        dateText: dateLabel(x.startAt),
        statusText: statusLabel(x.status),
        editable:
          x.status !== "CANCELLED" && Date.parse(x.startAt) > Date.now(),
      }));
      this.setData({
        items: reset ? rows : mergeUnique(this.data.items, rows),
        page: result.page,
        hasMore: result.hasMore,
      });
    } catch (e) {
      if (n === this._epoch) {
        // A failed page zero (filter) load leaves nothing to page from: loading
        // more stays blocked until the retry re-reads page zero.
        const denied =
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        this.setData({
          error: message(e),
          ...(reset ? { hasMore: false } : {}),
          ...(denied ? { authorized: false, items: [] } : {}),
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
  retry() {
    void this.load(!this.data.items.length);
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
      wx.navigateTo({ url: "/pages/admin-editor/index" });
  },
  edit(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (
      id &&
      this.data.authorized &&
      isSessionCurrent(this._session) &&
      !this.data.busyId
    )
      wx.navigateTo({ url: `/pages/admin-editor/index?id=${id}` });
  },
  roster(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (
      id &&
      this.data.authorized &&
      isSessionCurrent(this._session) &&
      !this.data.busyId
    )
      wx.navigateTo({ url: `/pages/admin-roster/index?id=${id}` });
  },
  cancelChange() {
    this.setData({
      pendingId: "",
      pendingAction: "",
      pendingConfirmed: false,
      pendingItem: null,
    });
  },
  confirmChange() {
    if (!this.data.pendingId) return;
    this.setData({ pendingConfirmed: true });
    return this.change({
      currentTarget: { dataset: { id: this.data.pendingId, action: this.data.pendingAction } },
    } as unknown as WechatMiniprogram.TouchEvent);
  },
  async change(e: WechatMiniprogram.TouchEvent) {
    if (
      this.data.busyId ||
      !this.data.authorized ||
      !isSessionCurrent(this._session)
    )
      return;
    const id = safeId(e.currentTarget.dataset.id),
      action = e.currentTarget.dataset.action;
    if (action !== "publish" && action !== "cancel") return;
    if (
      !this.data.pendingConfirmed ||
      this.data.pendingId !== id ||
      this.data.pendingAction !== action
    ) {
      const item = this.data.items.find((x) => x.id === id);
      if (!item) return;
      // Keep the exact displayed snapshot; the confirmation is only valid for it.
      this.setData({
        pendingId: id,
        pendingAction: action,
        pendingConfirmed: false,
        pendingItem: { ...item },
      });
      return;
    }
    const snapshot = this.data.pendingItem;
    const current = this.data.items.find((x) => x.id === id);
    this.setData({
      pendingId: "",
      pendingAction: "",
      pendingConfirmed: false,
      pendingItem: null,
    });
    if (!snapshot || !current || current.version !== snapshot.version) {
      this.setData({ error: "活动已变化，请重新核对后再操作" });
      return;
    }
    const epoch = this._epoch,
      session = this._session;
    this.setData({ busyId: id, error: "" });
    try {
      await requireAdmin();
      if (epoch !== this._epoch || !isSessionCurrent(session)) return;
      const result = await request<Activity>(
        `/admin/activities/${id}/${action}`,
        "POST",
        { version: current.version },
      );
      if (epoch !== this._epoch || !isSessionCurrent(session)) return;
      // Completion is announced only for the state the server confirmed.
      const expected = action === "cancel" ? "CANCELLED" : "PUBLISHED";
      if (!result || result.status !== expected) {
        this.setData({
          error: "服务器尚未确认本次操作，请刷新列表核对后再试",
          busyId: "",
        });
        return;
      }
      this.setData({ resultItem: { ...result, cover: mediaUrl(result.coverUrl), dateText: dateLabel(result.startAt), statusText: statusLabel(result.status), editable: false }, busyId: "" });
      await this.load(true);
    } catch (e) {
      if (epoch === this._epoch) {
        this.setData({
          error:
            e instanceof ApiError && e.status === 409
              ? "活动已变化，请刷新列表后重试"
              : message(e),
          ...(!isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403))
            ? { authorized: false, items: [] }
            : {}),
        });
      }
    } finally {
      this.setData({ busyId: "" });
    }
  },
});
