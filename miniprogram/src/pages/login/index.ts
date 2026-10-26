import {
  login,
  request,
  hasSession,
  sessionVersion,
  isSessionCurrent,
  ApiError,
} from "../../utils/api";
import {
  currentLegal,
  legalLink,
  versionsOf,
  sameVersions,
  LegalCurrent,
} from "../../utils/legal";
import { message } from "../../utils/domain";
Page({
  data: {
    current: null as LegalCurrent | null,
    loading: true,
    busy: false,
    agreed: false,
    privacyRead: false,
    termsRead: false,
    error: "",
    mode: "login",
    success: false,
  },
  _epoch: 0,
  onLoad(o) {
    this.setData({ mode: o.mode === "consent" ? "consent" : "login" });
    void this.load();
  },
  onHide() {
    this._epoch++;
    this.setData({ busy: false });
  },
  onUnload() {
    this._epoch++;
  },
  async load() {
    const n = ++this._epoch;
    this.setData({
      busy: false,
      loading: true,
      error: "",
      agreed: false,
      privacyRead: false,
      termsRead: false,
      current: null,
    });
    try {
      const current = await currentLegal();
      if (n === this._epoch) this.setData({ current });
    } catch (e) {
      if (n === this._epoch) this.setData({ error: message(e) });
    } finally {
      if (n === this._epoch) this.setData({ loading: false });
    }
  },
  readPrivacy() {
    this.openDocument("PRIVACY");
  },
  readTerms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.current) return;
    const expected =
      kind === "PRIVACY"
        ? this.data.current.privacy?.version
        : this.data.current.terms?.version;
    wx.navigateTo({
      url: legalLink(kind, this.data.current),
      events: {
        legalDocumentLoaded: (document: { kind: string; version: number }) => {
          const current =
            kind === "PRIVACY"
              ? this.data.current?.privacy?.version
              : this.data.current?.terms?.version;
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
  agreement(e: WechatMiniprogram.CheckboxGroupChange) {
    const wants = e.detail.value.includes("yes");
    if (wants && (!this.data.privacyRead || !this.data.termsRead)) {
      this.setData({ agreed: false, error: "请先分别打开并阅读两份协议" });
      return;
    }
    this.setData({ agreed: wants, error: "" });
  },
  async submit() {
    if (this.data.busy || this.data.loading || this.data.success) return;
    if (
      !this.data.current ||
      !this.data.agreed ||
      !this.data.privacyRead ||
      !this.data.termsRead
    ) {
      this.setData({ error: "请阅读并主动同意当前隐私政策和用户协议" });
      return;
    }
    const n = ++this._epoch,
      session = sessionVersion();
    this.setData({ busy: true, error: "" });
    try {
      const versions = versionsOf(this.data.current),
        latest = await currentLegal();
      if (n !== this._epoch) return;
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({
          current: latest,
          agreed: false,
          privacyRead: false,
          termsRead: false,
        });
        throw new Error("协议版本已更新，请重新阅读并确认");
      }
      if (this.data.mode === "consent") {
        if (!hasSession())
          throw new Error("登录已失效，请返回我的重新微信登录");
        if (!isSessionCurrent(session))
          throw new Error("账号已切换，请返回后重试");
        await request("/me/consents", "POST", versions);
      } else await login(versions, () => n === this._epoch);
      if (n !== this._epoch) return;
      this.setData({ success: true });
      wx.navigateBack({
        delta: 1,
        fail: () => wx.switchTab({ url: "/pages/mine/index" }),
      });
    } catch (e) {
      if (n !== this._epoch) return;
      if (
        e instanceof ApiError &&
        ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(e.code)
      ) {
        await this.load();
        this.setData({ error: message(e) + "，请重新阅读并确认" });
      } else this.setData({ error: message(e) });
    } finally {
      if (n === this._epoch) this.setData({ busy: false });
    }
  },
  browse() {
    this._epoch++;
    wx.switchTab({ url: "/pages/home/index" });
  },
  admin() {
    this._epoch++;
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  retry() {
    void this.load();
  },
});
