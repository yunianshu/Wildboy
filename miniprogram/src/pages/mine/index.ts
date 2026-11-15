import {
  request,
  getCurrentUser,
  logout,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { User } from "../../utils/models";
import { isActivityUser } from "../../utils/user-profile";
import { message, RequestEpoch } from "../../utils/domain";
import { syncTabBar } from "../../utils/tab-bar";
import { measureCapsuleHeader } from "../../utils/capsule-header";
import { buildVersion } from "../../build-version";
const epoch = new RequestEpoch();
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    topInset: 48,
    version: buildVersion,
    user: null as User | null,
    activityUser: false,
    adminLoginEnabled: false,
    adminCapabilityLoading: false,
    adminCapabilityError: "",
    requiresConsent: false,
    legalStatusLoading: false,
    legalStatusRetryable: false,
    legalStatusError: "",
    loading: false,
    loggingIn: false,
    error: "",
  },
  capabilityEpoch: 0,
  capabilityFlight: undefined as Promise<void> | undefined,
  onLoad() {
    const layout = measureCapsuleHeader();
    this.setData({ topInset: layout.top + 10, headerLayout: layout });
    try {
      // WeChat provides the published version in the release environment.
      const version = wx.getAccountInfoSync()?.miniProgram?.version?.trim();
      if (version) this.setData({ version });
    } catch {
      // The package version still works when older clients cannot read account info.
    }
  },
  onResize() {
    this.setData({ headerLayout: measureCapsuleHeader() });
  },
  onShow() {
    enterPage(this);
    syncTabBar(this);
    void this.load();
    void this.loadAdminCapability();
  },
  onHide() {
    epoch.invalidate();
    this.capabilityEpoch++;
    this.capabilityFlight = undefined;
    this.setData({
      user: null,
      activityUser: false,
      adminLoginEnabled: false,
      adminCapabilityLoading: false,
      adminCapabilityError: "",
      loading: false,
      requiresConsent: false,
      legalStatusLoading: false,
      legalStatusRetryable: false,
      legalStatusError: "",
    });
  },
  onUnload() {
    epoch.invalidate();
    this.capabilityEpoch++;
    this.capabilityFlight = undefined;
  },
  async load() {
    const n = epoch.next();
    this.setData({
      user: null,
      activityUser: false,
      error: "",
      loading: hasSession(),
      requiresConsent: false,
      legalStatusLoading: false,
      legalStatusRetryable: false,
      legalStatusError: "",
    });
    if (!hasSession()) return;
    const session = sessionVersion();
    let legalStatus: Promise<void> | undefined;
    try {
      const user = await getCurrentUser();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this.setData({
        user,
        activityUser: isActivityUser(user),
      });
      // The account is shown as soon as it loads; the independent legal check
      // only needs to settle before this load resolves, never before that.
      if (user.role === "USER") legalStatus = this.loadLegalStatus(n, session);
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e), user: null });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
    if (legalStatus) await legalStatus;
  },
  async loadLegalStatus(n: number, session: number) {
    // The legal check cannot block or reset the freshly loaded account: it reports
    // independently and stays retryable on its own.
    this.setData({ legalStatusLoading: true, legalStatusRetryable: false });
    try {
      const status = await request<{
        requiresConsent: boolean;
        ready: boolean;
      }>("/me/consents");
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this.setData({
        requiresConsent: status?.requiresConsent === true,
        legalStatusError:
          status?.ready === false
            ? "运营方正在准备协议；你仍可查看或取消已有报名。"
            : "",
        legalStatusLoading: false,
      });
    } catch (e) {
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this.setData({
        legalStatusError: "暂时无法核对协议版本，可重试；已有报名仍可查看。",
        legalStatusLoading: false,
        legalStatusRetryable: true,
      });
    }
  },
  retryLegalStatus() {
    if (!this.data.legalStatusRetryable || !hasSession()) return;
    void this.loadLegalStatus(epoch.next(), sessionVersion());
  },
  async loadAdminCapability() {
    // Deduplicated fire-and-forget: a duplicate call neither re-requests nor waits on
    // the shared in-flight request; callers needing the result keep the first promise.
    if (this.capabilityFlight) return;
    const n = ++this.capabilityEpoch;
    this.setData({ adminLoginEnabled: false, adminCapabilityLoading: true, adminCapabilityError: "" });
    const pending = (async () => {
      try {
        const result = await request<{ adminLoginEnabled?: unknown }>(
          "/auth/capabilities",
        );
        if (n !== this.capabilityEpoch) return;
        if (result?.adminLoginEnabled === true)
          this.setData({ adminLoginEnabled: true, adminCapabilityError: "" });
        else if (result?.adminLoginEnabled === false)
          this.setData({ adminLoginEnabled: false, adminCapabilityError: "" });
        else this.setData({ adminCapabilityError: "管理入口状态异常，请稍后重试" });
      } catch (e) {
        if (n === this.capabilityEpoch)
          this.setData({ adminCapabilityError: message(e) });
      } finally {
        if (n === this.capabilityEpoch) this.setData({ adminCapabilityLoading: false });
      }
    })();
    this.capabilityFlight = pending;
    try {
      await pending;
    } finally {
      if (this.capabilityFlight === pending) this.capabilityFlight = undefined;
    }
    return pending;
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  confirmLegal() {
    wx.navigateTo({ url: "/pages/login/index?mode=consent" });
  },
  activityOrders() {wx.navigateTo({url:"/pages/activity-orders/index"});},
  activityOrderManage() {if(this.data.user?.role === "ADMIN")wx.navigateTo({url:"/pages/admin-activity-orders/index"});},
  membershipManage() { if (this.data.user?.role === "ADMIN") wx.navigateTo({ url: "/pages/admin-memberships/index" }); },
  registrations() {
    wx.navigateTo({ url: "/pages/registrations/index" });
  },
  notifications() { wx.navigateTo({url:"/pages/notifications/index"}); },
  profile() {
    wx.navigateTo({ url: "/pages/profile/index" });
  },
  userManage() {
    if (this.data.user?.role === "ADMIN")
      wx.navigateTo({ url: "/pages/admin-users/index" });
  },
  manage() {
    if (this.data.user?.role === "ADMIN")
      wx.navigateTo({ url: "/pages/admin-activities/index" });
  },
  legalManage() {
    if (this.data.user?.role === "ADMIN")
      wx.navigateTo({ url: "/pages/admin-legal/index" });
  },
  terms() {
    wx.navigateTo({ url: "/pages/privacy/index?kind=TERMS" });
  },
  adminSignIn() {
    if (!this.data.adminLoginEnabled) return;
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  privacy() {
    wx.navigateTo({ url: "/pages/privacy/index" });
  },
  retry() {
    void this.load();
  },
  async signOut() {
    const session = sessionVersion();
    try {
      const answer = await wx.showModal({
        title: "退出当前账号？",
        content:
          "不会取消已报名活动。管理账号与微信账号的报名记录分别归属各自账号。",
      });
      if (!answer.confirm || !isSessionCurrent(session)) return;
      epoch.invalidate();
      logout();
      await this.load();
    } catch (error) {
      if (isSessionCurrent(session)) this.setData({ error: message(error) });
    }
  },
});
