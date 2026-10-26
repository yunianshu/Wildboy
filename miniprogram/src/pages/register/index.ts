import { request, requireSession } from "../../utils/api";
import { Activity } from "../../utils/models";
import {
  activityView,
  message,
  safeId,
  validateParticipant,
  RequestEpoch,
} from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    id: "",
    activity: null as ReturnType<typeof activityView> | null,
    loading: true,
    error: "",
    name: "",
    phone: "",
    consent: false,
    submitting: false,
    success: false,
    fieldError: "",
  },
  onLoad(o) {
    const id = safeId(o.id);
    this.setData({ id });
    if (id) void this.load();
    else this.setData({ error: "活动链接无效", loading: false });
  },
  onUnload() {
    epoch.invalidate();
  },
  async load() {
    const n = epoch.next();
    this.setData({ loading: true, error: "" });
    try {
      const a = await request<Activity>(`/activities/${this.data.id}`);
      if (epoch.valid(n)) this.setData({ activity: activityView(a) });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  retry() {
    void this.load();
  },
  inputName(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value, fieldError: "" });
  },
  inputPhone(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value, fieldError: "" });
  },
  consentChange(e: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({ consent: e.detail.value.includes("yes"), fieldError: "" });
  },
  privacy() {
    wx.navigateTo({ url: "/pages/privacy/index" });
  },
  async submit() {
    if (this.data.submitting || this.data.success) return;
    const fieldError = validateParticipant(
      this.data.name,
      this.data.phone,
      this.data.consent,
    );
    if (fieldError) {
      this.setData({ fieldError });
      return;
    }
    if (!this.data.activity?.enabled) {
      this.setData({ fieldError: "当前活动不可报名，请返回刷新" });
      return;
    }
    this.setData({ submitting: true, fieldError: "" });
    const n = epoch.next();
    try {
      await requireSession();
      if (!epoch.valid(n)) return;
      await request(`/activities/${this.data.id}/registrations`, "POST", {
        participantName: this.data.name.trim(),
        phone: this.data.phone.trim(),
      });
      if (epoch.valid(n)) this.setData({ success: true, name: "", phone: "" });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ fieldError: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ submitting: false });
    }
  },
  done() {
    wx.redirectTo({ url: `/pages/detail/index?id=${this.data.id}` });
  },
  myActivities() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
