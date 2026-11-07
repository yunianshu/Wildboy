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
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
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
    status: "",
    statuses: [
      { value: "", label: "全部" },
      { value: "CONFIRMED", label: "已报名" },
      { value: "CANCELLED", label: "已取消" },
    ],
  },
  _epoch: 0,
  _session: -1,
  _phones: {} as Record<string, string>,
  _idNumbers: {} as Record<string, string>,
  onLoad(query: Record<string, string>) {
    this.setData({ id: safeId(query.id) });
  },
  onShow() {
    enterPage(this);
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
          `/admin/activities/${this.data.id}/registrations?page=${reset ? 0 : this.data.page + 1}&size=20${this.data.status ? `&status=${this.data.status}` : ""}`,
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
          // A failed page zero leaves nothing to page from: only the retry may
          // re-read page zero before any later page loads.
          ...(reset ? { hasMore: false, total: 0 } : {}),
          ...(denied ? { authorized: false, activity: null, items: [] } : {}),
        });
      }
    } finally {
      if (n === this._epoch)
        this.setData({ loading: false, loadingMore: false });
    }
  },
  filter(e: WechatMiniprogram.TouchEvent) {
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
  // Exports the full registration list as a CSV and hands the file to WeChat, so
  // organizers can check people in outside the mini program. The sheet carries masked
  // identity numbers only; revealing a full identity stays an audited per-participant act.
  async export() {
    if (
      !this.data.authorized ||
      !this.data.activity ||
      !this.data.total ||
      this.data.loading ||
      this.data.loadingMore ||
      !isSessionCurrent(this._session)
    )
      return;
    const n = this._epoch,
      session = this._session;
    try {
      const answer = await wx.showModal({
        title: "导出报名名单到微信",
        content:
          "名单包含姓名与联系方式，仅用于本次活动核验与联系，请勿外传。证件号保持脱敏。",
        confirmText: "导出",
      });
      if (!answer.confirm || n !== this._epoch || !isSessionCurrent(session))
        return;
      await requireAdmin();
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      this.setData({ loading: true, error: "" });
      const rows: string[][] = [
        ["序号", "姓名", "手机号", "证件号", "状态", "报名时间", "同行序号"],
      ];
      let page = 0,
        hasMore = true;
      while (hasMore && page <= 100) {
        const result = await request<PageResult<Registration>>(
          `/admin/activities/${this.data.id}/registrations?page=${page}&size=100`,
        );
        if (n !== this._epoch || !isSessionCurrent(session)) return;
        for (const registration of result.items) {
          const statusText =
            registration.status === "CONFIRMED" ? "已报名" : "已取消";
          const createdText = dateLabel(registration.createdAt);
          registration.participants.forEach((participant, index) => {
            rows.push([
              String(rows.length),
              participant.participantName,
              participant.phone,
              participant.idNumber,
              statusText,
              createdText,
              String(index + 1),
            ]);
          });
        }
        hasMore = result.hasMore;
        page += 1;
      }
      const csv =
        "\uFEFF" +
        rows
          .map((row) =>
            row
              .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(","),
          )
          .join("\r\n");
      const path = `${wx.env.USER_DATA_PATH}/roster-${this.data.id}.csv`;
      wx.getFileSystemManager().writeFileSync(path, csv, "utf8");
      const title = this.data.activity.title.slice(0, 30);
      await new Promise<void>((resolve, reject) => {
        wx.shareFileMessage({
          filePath: path,
          fileName: `报名名单-${title}.csv`,
          success: () => resolve(),
          fail: (failure) => reject(new Error(failure.errMsg)),
        });
      });
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      this.setData({ loading: false });
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
          ...(denied ? {} : { loading: false }),
        });
      }
    }
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
      const detail = await request<{ phone: string; idNumber: string }>(`/admin/activities/${this.data.id}/participants/${id}/reveal`, "POST");
      if (n !== this._epoch || !isSessionCurrent(session)) return;
      await wx.showModal({
        title: "仅用于本次活动组织（已记录访问）",
        content: `手机号：${detail.phone}\n身份证号：${detail.idNumber || "未采集"}`,
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
