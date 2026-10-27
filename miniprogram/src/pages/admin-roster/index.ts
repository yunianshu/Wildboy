import { request, isSessionCurrent, ApiError } from "../../utils/api";
import { Activity, Registration, PageResult } from "../../utils/models";
import {
  message,
  dateLabel,
  safeId,
  mergeUnique,
  maskIdNumber,
} from "../../utils/domain";
import { requireAdmin, maskPhone } from "../admin-editor/shared";
type ParticipantRow = {
  id: string;
  participantName: string;
  maskedPhone: string;
  maskedId: string;
};
type Row = {
  id: string;
  participants: ParticipantRow[];
  dateText: string;
  statusText: string;
};
Page({
  data: {
    id: "",
    authorized: false,
    loading: false,
    loadingMore: false,
    error: "",
    activity: null as Activity | null,
    dateText: "",
    remaining: 0,
    items: [] as Row[],
    page: 0,
    hasMore: false,
    total: 0,
  },
  _epoch: 0,
  _session: -1,
  _phones: {} as Record<string, string>,
  _idNumbers: {} as Record<string, string>,
  onLoad(query: Record<string, string>) {
    this.setData({ id: safeId(query.id) });
  },
  onShow() {
    void this.load(true);
  },
  onHide() {
    this._epoch++;
    this._phones = {};
    this._idNumbers = {};
    this.setData({
      authorized: false,
      activity: null,
      items: [],
      loading: false,
      loadingMore: false,
    });
  },
  onUnload() {
    this._epoch++;
    this._phones = {};
    this._idNumbers = {};
  },
  onReachBottom() {
    void this.load(false);
  },
  async load(reset = true) {
    if (!this.data.id) {
      this.setData({ error: "活动编号无效" });
      return;
    }
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
      ...(reset ? { items: [], activity: null, page: 0 } : {}),
    });
    if (reset) {
      this._phones = {};
      this._idNumbers = {};
    }
    try {
      const session = await requireAdmin();
      if (n !== this._epoch) return;
      this._session = session;
      this.setData({ authorized: true });
      const [activity, result] = await Promise.all([
        request<Activity>(`/admin/activities/${this.data.id}`),
        request<PageResult<Registration>>(
          `/admin/activities/${this.data.id}/registrations?page=${reset ? 0 : this.data.page + 1}&size=20`,
        ),
      ]);
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      const rows = result.items.map((x) => ({
        id: x.id,
        participants: x.participants.map((participant) => {
          this._phones[participant.id] = participant.phone;
          this._idNumbers[participant.id] = participant.idNumber;
          return {
            id: participant.id,
            participantName: participant.participantName,
            maskedPhone: maskPhone(participant.phone),
            maskedId: maskIdNumber(participant.idNumber),
          };
        }),
        dateText: dateLabel(x.createdAt),
        statusText: x.status === "CONFIRMED" ? "已报名" : "已取消",
      }));
      this.setData({
        activity,
        dateText: dateLabel(activity.startAt),
        remaining: Math.max(0, activity.capacity - activity.registeredCount),
        items: reset ? rows : mergeUnique(this.data.items, rows),
        page: result.page,
        hasMore: result.hasMore,
        total: result.total,
      });
    } catch (e) {
      if (n === this._epoch) {
        const denied =
          !isSessionCurrent(this._session) ||
          (e instanceof ApiError && (e.status === 401 || e.status === 403));
        if (denied) {
          this._phones = {};
          this._idNumbers = {};
        }
        this.setData({
          error: message(e),
          ...(denied ? { authorized: false, activity: null, items: [] } : {}),
        });
      }
    } finally {
      if (n === this._epoch)
        this.setData({ loading: false, loadingMore: false });
    }
  },
  retry() {
    void this.load(!this.data.items.length);
  },
  login() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  async reveal(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (!id || !this.data.authorized || !isSessionCurrent(this._session))
      return;
    const n = this._epoch,
      session = this._session;
    try {
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(session) || !this._phones[id])
        return;
      await wx.showModal({
        title: "仅用于本次活动组织",
        content: `手机号：${this._phones[id]}\n身份证号：${this._idNumbers[id] || "历史记录未登记"}`,
        showCancel: false,
        confirmText: "我知道了",
      });
    } catch (error) {
      if (n === this._epoch) {
        const denied =
          !isSessionCurrent(this._session) ||
          (error instanceof ApiError &&
            (error.status === 401 || error.status === 403));
        if (denied) {
          this._phones = {};
          this._idNumbers = {};
        }
        this.setData({
          error: message(error),
          ...(denied ? { authorized: false, activity: null, items: [] } : {}),
        });
      }
    }
  },
});
