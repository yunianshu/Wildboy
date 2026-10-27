import {
  request,
  getCurrentUser,
  login,
  logout,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { User } from "../../utils/models";
import { message, RequestEpoch } from "../../utils/domain";
const epoch = new RequestEpoch();
Page({
  data: {
    topInset: 48,
    user: null as User | null,
    requiresConsent: false,
    legalStatusError: "",
    loading: false,
    loggingIn: false,
    error: "",
  },
  onLoad() {
    this.setData({ topInset: wx.getWindowInfo().statusBarHeight + 10 });
  },
  onShow() {
    void this.load();
  },
  onHide() {
    epoch.invalidate();
    this.setData({
      user: null,
      loading: false,
      requiresConsent: false,
      legalStatusError: "",
    });
  },
  onUnload() {
    epoch.invalidate();
  },
  async load() {
    const n = epoch.next();
    this.setData({
      user: null,
      error: "",
      loading: hasSession(),
      requiresConsent: false,
      legalStatusError: "",
    });
    if (!hasSession()) return;
    const session = sessionVersion();
    try {
      const user = await getCurrentUser();
      if (epoch.valid(n) && isSessionCurrent(session)) this.setData({ user });
      if (user.role === "USER" && epoch.valid(n) && isSessionCurrent(session)) {
        try {
          const status = await request<{
            requiresConsent: boolean;
            ready: boolean;
          }>("/me/consents");
          if (epoch.valid(n) && isSessionCurrent(session))
            this.setData({
              requiresConsent: status?.requiresConsent === true,
              legalStatusError:
                status?.ready === false
                  ? "运营方正在准备协议；你仍可查看或取消已有报名。"
                  : "",
            });
        } catch (e) {
          if (epoch.valid(n))
            this.setData({
              user: hasSession() ? user : null,
              legalStatusError:
                "暂时无法核对协议版本，可重试；已有报名仍可查看。",
            });
        }
      }
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e), user: null });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  confirmLegal() {
    wx.navigateTo({ url: "/pages/login/index?mode=consent" });
  },
  registrations() {
    wx.navigateTo({ url: "/pages/registrations/index" });
  },
  orders() {
    wx.navigateTo({ url: "/pages/orders/index" });
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
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  explore() {
    wx.switchTab({ url: "/pages/activities/index" });
  },
  privacy() {
    wx.navigateTo({ url: "/pages/privacy/index" });
  },
  retry() {
    void this.load();
  },
  async signOut() {
    const answer = await wx.showModal({
      title: "退出当前账号？",
      content:
        "不会取消已报名活动。管理账号与微信账号的报名记录分别归属各自账号。",
    });
    if (!answer.confirm) return;
    epoch.invalidate();
    logout();
    this.setData({ user: null, error: "", loading: false });
  },
});
