import { request, mediaUrl, hasSession } from "../../utils/api";
import { Activity, Registration } from "../../utils/models";
import {
  activityView,
  dateLabel,
  message,
  safeId,
  RequestEpoch,
} from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    id: "",
    activity: null as ReturnType<typeof activityView> | null,
    registration: null as Registration | null,
    loading: true,
    error: "",
    registrationError: "",
    deadline: "",
    endDate: "",
    cancelling: false,
  },
  onLoad(options) {
    const id = safeId(options.id);
    this.setData({ id });
    if (!id) this.setData({ loading: false, error: "活动链接无效" });
  },
  onShow() {
    if (this.data.id) void this.load();
  },
  onUnload() {
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      registrationError: "",
      registration: null,
    });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (!epoch.valid(n)) return;
      this.setData({
        activity: activityView({
          ...a,
          coverUrl: mediaUrl(a.coverUrl),
          galleryUrls: a.galleryUrls.map(mediaUrl),
        }),
        deadline: dateLabel(a.registrationDeadline),
        endDate: dateLabel(a.endAt),
      });
      if (hasSession()) {
        try {
          const registration = await request<Registration | null>(
            `/activities/${this.data.id}/registrations/me`,
          );
          if (epoch.valid(n)) this.setData({ registration });
        } catch (e) {
          if (epoch.valid(n)) this.setData({ registrationError: message(e) });
        }
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  register() {
    if (this.data.activity?.enabled)
      wx.navigateTo({ url: `/pages/register/index?id=${this.data.id}` });
  },
  async cancel() {
    if (this.data.cancelling || !this.data.activity?.canCancel) return;
    this.setData({ cancelling: true });
    const answer = await wx.showModal({
      title: "取消这次报名？",
      content: "取消后名额会释放给其他伙伴；重新报名取决于剩余名额与截止时间。",
      confirmText: "确认取消",
      confirmColor: "#8A4B31",
    });
    if (!answer.confirm) {
      this.setData({ cancelling: false });
      return;
    }
    try {
      await request(`/activities/${this.data.id}/registrations/me`, "DELETE");
      wx.showToast({ title: "报名已取消", icon: "success" });
      await this.load();
    } catch (e) {
      wx.showModal({
        title: "暂未取消",
        content: message(e),
        showCancel: false,
      });
    } finally {
      this.setData({ cancelling: false });
    }
  },
  onShareAppMessage() {
    return {
      title: this.data.activity?.title || "Wildboy · 一起去山野",
      path: `/pages/detail/index?id=${this.data.id}`,
      imageUrl: this.data.activity?.coverUrl,
    };
  },
});
