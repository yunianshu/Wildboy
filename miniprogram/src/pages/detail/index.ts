import { loadContent, ContentBlock } from "../../utils/content";
import {
  request,
  mediaUrl,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
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
  _contentGeneration: 0,
  data: {
    id: "",
    contentBlocks: [] as ContentBlock[],
    contentError: "",
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
    if (this.data.id) { void this.load(); void this.loadRichContent(); }
  },
  onHide() {
    epoch.invalidate();
    this.setData({ registration: null, cancelling: false });
  },
  onUnload() {
    this._contentGeneration++;
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
  async loadRichContent() {
    const id = this.data.id, generation = ++this._contentGeneration;
    try { const document = await loadContent(`/activities/${id}/content`);
      if (this.data.id === id && generation === this._contentGeneration) this.setData({contentBlocks: document.blocks, contentError: ""});
    } catch (_) { if (this.data.id === id && generation === this._contentGeneration) this.setData({contentError: "图文暂未加载"}); }
  },
  retry() {
    void this.load();
  },
  waitlist() { if (this.data.activity?.canCancel && !this.data.activity.available) wx.navigateTo({url:`/pages/register/index?id=${this.data.id}&waitlist=1`}); },
  register() {
    if (this.data.activity?.enabled)
      wx.navigateTo({ url: `/pages/register/index?id=${this.data.id}` });
  },
  async cancel() {
    if (this.data.cancelling || this.data.loading || !this.data.activity?.canCancel) return;
    const n = epoch.next(),
      session = sessionVersion();
    this.setData({ cancelling: true });
    let answer;
    try {
      answer = await wx.showModal({
        title: "取消这次报名？",
        content: "取消后整单所有参与人的名额都会释放；重新报名取决于剩余名额与截止时间。",
        confirmText: "确认取消",
        confirmColor: "#8A4B31",
      });
    } catch (error) {
      if (epoch.valid(n) && isSessionCurrent(session))
        this.setData({ cancelling: false, registrationError: message(error) });
      return;
    }
    if (!epoch.valid(n) || !isSessionCurrent(session)) return;
    if (!answer.confirm) {
      this.setData({ cancelling: false });
      return;
    }
    try {
      await request(`/activities/${this.data.id}/registrations/me`, "DELETE");
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      wx.showToast({ title: "报名已取消", icon: "success" });
      await this.load();
    } catch (e) {
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
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
