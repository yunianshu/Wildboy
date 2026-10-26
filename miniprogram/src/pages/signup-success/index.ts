import {
  request,
  hasSession,
  mediaUrl,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Activity, Registration } from "../../utils/models";
import {
  activityView,
  message,
  safeId,
  RequestEpoch,
} from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    id: "",
    registrationId: "",
    loading: true,
    error: "",
    confirmed: false,
    activity: null as ReturnType<typeof activityView> | null,
  },
  onLoad(o) {
    this.setData({
      id: safeId(o.id),
      registrationId: safeId(o.registrationId),
    });
  },
  onShow() {
    void this.load();
  },
  onHide() {
    epoch.invalidate();
    this.setData({ confirmed: false, activity: null });
  },
  onUnload() {
    epoch.invalidate();
  },
  async load() {
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({
      loading: true,
      error: "",
      confirmed: false,
      activity: null,
    });
    if (!this.data.id || !this.data.registrationId) {
      this.setData({
        loading: false,
        error: "报名凭据不完整，请从我的报名查看",
      });
      return;
    }
    if (!hasSession()) {
      this.setData({
        loading: false,
        error: "登录已失效，请从我的报名重新登录查看",
      });
      return;
    }
    try {
      const [a, r] = await Promise.all([
        request<Activity>(`/activities/${this.data.id}`),
        request<Registration | null>(
          `/activities/${this.data.id}/registrations/me`,
        ),
      ]);
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      if (
        !r ||
        r.id !== this.data.registrationId ||
        r.activityId !== this.data.id ||
        r.status !== "CONFIRMED" ||
        a.status !== "PUBLISHED"
      ) {
        this.setData({
          error: "当前没有有效报名，可能已取消，请查看最新活动安排",
        });
        return;
      }
      this.setData({
        confirmed: true,
        activity: activityView({ ...a, coverUrl: mediaUrl(a.coverUrl) }),
      });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  details() {
    if (this.data.id)
      wx.redirectTo({ url: `/pages/detail/index?id=${this.data.id}` });
  },
  registrations() {
    wx.redirectTo({ url: "/pages/registrations/index" });
  },
});
