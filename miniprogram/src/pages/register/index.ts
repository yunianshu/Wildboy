import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";
import { request, requireSession, ApiError } from "../../utils/api";
import { Activity, Registration } from "../../utils/models";
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
    legal: null as LegalCurrent | null,
    legalError: "",
    privacyRead: false,
    termsRead: false,
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
  onHide() {
    epoch.invalidate();
    this.setData({ submitting: false });
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
      try {
        const legal = await currentLegal();
        if (epoch.valid(n))
          this.setData({
            legal,
            legalError: "",
            consent: false,
            privacyRead: false,
            termsRead: false,
          });
      } catch (e) {
        if (epoch.valid(n))
          this.setData({ legal: null, legalError: message(e), consent: false });
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
  inputName(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value, fieldError: "" });
  },
  inputPhone(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value, fieldError: "" });
  },
  consentChange(e: WechatMiniprogram.CheckboxGroupChange) {
    const wants = e.detail.value.includes("yes");
    if (wants && (!this.data.privacyRead || !this.data.termsRead)) {
      this.setData({
        consent: false,
        fieldError: "请先阅读隐私政策和用户协议",
      });
      return;
    }
    this.setData({ consent: wants, fieldError: "" });
  },
  privacy() {
    this.openDocument("PRIVACY");
  },
  terms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.legal) return;
    const expected =
      kind === "PRIVACY"
        ? this.data.legal.privacy?.version
        : this.data.legal.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.legal),
      events: {
        legalDocumentLoaded: (document: { kind: string; version: number }) => {
          const current =
            kind === "PRIVACY"
              ? this.data.legal?.privacy?.version
              : this.data.legal?.terms?.version;
          if (
            document.kind === kind &&
            document.version === expected &&
            current === expected
          )
            this.setData({
              [kind === "PRIVACY" ? "privacyRead" : "termsRead"]: true,
            });
        },
      },
    });
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
    if (!this.data.legal || !this.data.privacyRead || !this.data.termsRead) {
      this.setData({
        fieldError: this.data.legalError || "请阅读当前隐私政策和用户协议",
      });
      return;
    }
    this.setData({ submitting: true, fieldError: "" });
    const n = epoch.next();
    try {
      await requireSession();
      if (!epoch.valid(n)) return;
      const versions = versionsOf(this.data.legal!);
      const latest = await currentLegal();
      if (!epoch.valid(n)) return;
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({
          legal: latest,
          consent: false,
          privacyRead: false,
          termsRead: false,
        });
        throw new Error("协议版本已更新，请重新阅读并确认");
      }
      const result = await request<Registration>(
        `/activities/${this.data.id}/registrations`,
        "POST",
        {
          participantName: this.data.name.trim(),
          phone: this.data.phone.trim(),
          ...versions,
        },
      );
      if (
        !result ||
        !safeId(result.id) ||
        result.activityId !== this.data.id ||
        result.status !== "CONFIRMED"
      )
        throw new Error("报名结果未确认，请到我的报名核对，勿重复提交");
      if (epoch.valid(n)) {
        this.setData({ success: true, name: "", phone: "" });
        wx.redirectTo({
          url: `/pages/signup-success/index?id=${this.data.id}&registrationId=${result.id}`,
        });
      }
    } catch (e) {
      if (epoch.valid(n)) {
        if (
          e instanceof ApiError &&
          ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(e.code)
        ) {
          this.setData({
            consent: false,
            privacyRead: false,
            termsRead: false,
            legal: null,
            legalError: "协议已变化，请重新加载页面阅读",
          });
        }
        this.setData({ fieldError: message(e) });
      }
    } finally {
      if (epoch.valid(n)) this.setData({ submitting: false });
    }
  },
  done() {
    wx.redirectTo({ url: `/pages/detail/index?id=${this.data.id}` });
  },
  myActivities() {
    wx.navigateTo({ url: "/pages/registrations/index" });
  },
});
