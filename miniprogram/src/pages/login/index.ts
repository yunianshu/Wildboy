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
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    current: null as LegalCurrent | null,
    loading: true,
    busy: false,
    agreed: false,
    privacyRead: false,
    termsRead: false,
    error: "",
    mode: "login",
    success: false,
    adminLoginEnabled: false,
    adminCapabilityLoading: false,
    adminCapabilityError: "",
  },
  _epoch: 0,
  _reloadOnShow: false,
  _capabilityEpoch: 0,
  _capabilityFlight: undefined as Promise<void> | undefined,
  onLoad(o) {
    this.setData({ mode: o.mode === "consent" ? "consent" : "login" });
    void this.load();
    void this.loadAdminCapability();
  },
  onShow() {
    enterPage(this);
    if (this._reloadOnShow) {
      this._reloadOnShow = false;
      void this.load();
    }
  },
  onHide() {
    this._reloadOnShow = this.data.loading;
    this._epoch++;
    this._capabilityEpoch++;
    this._capabilityFlight = undefined;
    this.setData({ busy: false, adminCapabilityLoading: false });
  },
  onUnload() {
    this._epoch++;
    this._capabilityEpoch++;
    this._capabilityFlight = undefined;
  },
  async loadAdminCapability() {
    // Deduplicated fire-and-forget: a duplicate call neither re-requests nor waits on
    // the shared in-flight request; callers needing the result keep the first promise.
    if (this._capabilityFlight) return;
    const n = ++this._capabilityEpoch;
    this.setData({ adminCapabilityLoading: true, adminCapabilityError: "" });
    const pending = (async () => {
      try {
        const result = await request<{ adminLoginEnabled?: unknown }>(
          "/auth/capabilities",
        );
        if (n !== this._capabilityEpoch) return;
        if (result?.adminLoginEnabled === true)
          this.setData({ adminLoginEnabled: true, adminCapabilityError: "" });
        else if (result?.adminLoginEnabled === false)
          this.setData({ adminLoginEnabled: false, adminCapabilityError: "" });
        else this.setData({ adminCapabilityError: "管理入口状态异常，请稍后重试" });
      } catch (e) {
        if (n === this._capabilityEpoch)
          this.setData({ adminCapabilityError: message(e) });
      } finally {
        this.setData({ adminCapabilityLoading: false });
      }
    })();
    this._capabilityFlight = pending;
    try {
      await pending;
    } finally {
      if (this._capabilityFlight === pending) this._capabilityFlight = undefined;
    }
    return pending;
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
    if (!this.data.adminLoginEnabled) return;
    this._epoch++;
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },
  retry() {
    void this.load();
  },
});
