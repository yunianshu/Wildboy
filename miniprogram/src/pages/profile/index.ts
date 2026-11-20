import { enterPage } from "../../utils/page-motion";
import {
  ApiError,
  getCurrentUser,
  hasSession,
  isSessionCurrent,
  request,
  sessionVersion,
} from "../../utils/api";
import {
  currentLegal,
  legalLink,
  sameVersions,
  versionsOf,
  LegalCurrent,
} from "../../utils/legal";
import { message, RequestEpoch } from "../../utils/domain";
import { User } from "../../utils/models";
import { isActivityUser, profileInputError } from "../../utils/user-profile";
import { MembershipUser, identityLabel } from "../../utils/membership";

const epoch = new RequestEpoch();
const emptyDraft = () => ({ realName: "", phone: "" });
Page({
  visible: false,
  loaded: false,
  reloadOnShow: false,
  autoEditPending: false,
  loadedSession: -1,
  legalEpoch: 0,
  legalFlight: undefined as Promise<void> | undefined,
  membershipEpoch: 0,
  readerDraft: null as { session: number; userId: string; draft: ReturnType<typeof emptyDraft> } | null,
  data: {
    pageMotionClass: "",
    fromRegister: false,
    loggedIn: false,
    user: null as User | null,
    membership: null as MembershipUser | null,
    membershipLabel: "",
    membershipLoading: false,
    membershipError: "",
    activityUser: false,
    legal: null as LegalCurrent | null,
    legalLoading: false,
    legalError: "",
    loading: false,
    saving: false,
    editing: false,
    draft: emptyDraft(),
    consent: false,
    error: "",
    fieldError: "",
    notice: "",
  },
  onLoad(options: Record<string, string>) {
    this.setData({ fromRegister: options.from === "register" });
    this.autoEditPending = options.from === "register";
  },
  onShow() {
    enterPage(this);
    this.visible = true;
    if (!this.loaded || this.reloadOnShow) {
      this.reloadOnShow = false;
      void this.load();
      void this.loadMembership();
    }
  },
  onHide() {
    this.visible = false;
    if (this.data.editing && this.data.user && isSessionCurrent(this.loadedSession)) {
      this.readerDraft = { session: this.loadedSession, userId: this.data.user.id, draft: { ...this.data.draft } };
    }
    this.loaded = false;
    this.loadedSession = -1;
    this.reloadOnShow = this.data.loading;
    epoch.invalidate();
    this.membershipEpoch++;
    this.legalEpoch++;
    this.legalFlight = undefined;
    this.setData({
      user: null,
      membership: null,
      membershipLabel: "",
      membershipLoading: false,
      membershipError: "",
      activityUser: false,
      legal: null,
      legalLoading: false,
      legalError: "",
      loading: false,
      saving: false,
      editing: false,
      draft: emptyDraft(),
      consent: false,
      fieldError: "",
    });
  },
  copyMemberId() {
    const id = this.data.membership?.id;
    if (id && hasSession() && isSessionCurrent(this.loadedSession))
      wx.setClipboardData({ data: id });
  },
  onUnload() {
    this.onHide();
    this.readerDraft = null;
  },
  async load() {
    const n = epoch.next(),
      session = sessionVersion();
    this.legalEpoch++;
    this.legalFlight = undefined;
    this.loaded = true;
    this.setData({
      loggedIn: hasSession(),
      loading: hasSession(),
      error: "",
      notice: "",
      user: null,
      activityUser: false,
      legal: null,
      legalLoading: false,
      legalError: "",
    });
    if (!hasSession()) return;
    try {
      const [user, legal] = await Promise.all([getCurrentUser(), currentLegal()]);
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      this.loadedSession = session;
      this.setData({ user, activityUser: isActivityUser(user), legal });
      const resume = this.readerDraft;
      this.readerDraft = null;
      if (resume && resume.userId === user.id && isSessionCurrent(resume.session) && isActivityUser(user)) {
        this.setData({ editing: true, draft: resume.draft, consent: false });
      } else if (this.autoEditPending) {
        this.autoEditPending = false;
        this.openEditor();
      }
    } catch (error) {
      if (epoch.valid(n)) this.setData({ error: message(error), user: null, activityUser: false, legal: null, loggedIn: hasSession() });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  signIn() {
    wx.navigateTo({ url: "/pages/login/index" });
  },
  async loadMembership() {
    const n = ++this.membershipEpoch, session = sessionVersion();
    const ownsRequest = () => this.visible && n === this.membershipEpoch;
    this.setData({ membership: null, membershipLabel: "", membershipLoading: hasSession(), membershipError: "" });
    if (!hasSession()) return;
    try {
      const membership = await request<MembershipUser>("/me/membership");
      if (ownsRequest() && isSessionCurrent(session))
        this.setData({ membership, membershipLabel: identityLabel(membership) });
    } catch (error) {
      if (ownsRequest() && isSessionCurrent(session))
        this.setData({ membershipError: message(error) });
    } finally {
      if (ownsRequest()) this.setData({ membershipLoading: false });
    }
  },
  retry() {
    void this.load();
  },
  openEditor() {
    if (this.data.saving || !isActivityUser(this.data.user)) return;
    if (!this.data.legal) {
      this.setData({ error: "请先成功读取当前隐私政策和用户协议，再填写资料" });
      return;
    }
    this.legalEpoch++;
    this.legalFlight = undefined;
    this.setData({
      editing: true,
      draft: {
        realName: this.data.user.realName || "",
        phone: this.data.user.phone || "",
      },
      consent: false,
      fieldError: "",
      error: "",
      notice: "",
      legalLoading: false,
      legalError: "",
    });
  },
  cancel() {
    if (this.data.saving) return;
    this.legalEpoch++;
    this.legalFlight = undefined;
    this.setData({ editing: false, draft: emptyDraft(), consent: false, fieldError: "", legalLoading: false, legalError: "" });
  },
  stopModalEvent() {},
  input(event: WechatMiniprogram.Input) {
    if (!this.data.editing || this.data.saving) return;
    const field = event.currentTarget.dataset.field;
    if (field === "realName" || field === "phone")
      this.setData({
        draft: { ...this.data.draft, [field]: event.detail.value },
        fieldError: "",
      });
  },
  consentChange(event: WechatMiniprogram.CheckboxGroupChange) {
    if (!this.data.editing || this.data.saving || this.data.loading || this.data.legalLoading || !this.data.legal) return;
    this.setData({ consent: event.detail.value.includes("yes"), fieldError: "" });
  },
  privacy() {
    this.openDocument("PRIVACY");
  },
  terms() {
    this.openDocument("TERMS");
  },
  openDocument(kind: "PRIVACY" | "TERMS") {
    if (!this.data.legal || this.data.saving) return;
    this.readerDraft = this.data.editing && this.data.user
      ? { session: sessionVersion(), userId: this.data.user.id, draft: { ...this.data.draft } } : null;
    wx.navigateTo({ url: legalLink(kind, this.data.legal), fail: () => { this.readerDraft = null; } });
  },
  retryLegal(): Promise<void> {
    if (this.data.saving || this.data.loading) return Promise.resolve();
    return this.loadEditorLegal();
  },
  loadEditorLegal(): Promise<void> {
    if (!this.data.editing || !isActivityUser(this.data.user) || !isSessionCurrent(this.loadedSession))
      return Promise.resolve();
    if (this.legalFlight) return this.legalFlight;
    const n = ++this.legalEpoch, session = this.loadedSession, userId = this.data.user.id;
    const ownsEditor = () => n === this.legalEpoch && this.data.editing && this.data.user?.id === userId;
    const valid = () => ownsEditor() && isSessionCurrent(session) && this.loadedSession === session;
    this.setData({ legal: null, legalLoading: true, legalError: "", consent: false, fieldError: "" });
    const pending = Promise.resolve().then(() => currentLegal()).then(legal => {
      if (valid()) this.setData({ legal, legalError: "", consent: false });
    }).catch(error => {
      if (valid()) this.setData({ legal: null, legalError: message(error), consent: false });
    }).finally(() => {
      if (valid()) this.setData({ legalLoading: false });
      else if (ownsEditor() && !isSessionCurrent(session)) {
        this.loadedSession = -1;
        this.readerDraft = null;
        this.setData({ user: null, activityUser: false, legal: null, legalLoading: false,
          legalError: "", editing: false, draft: emptyDraft(), consent: false,
          loggedIn: hasSession(), error: "账号已改变，请重新读取资料" });
      }
      if (this.legalFlight === pending) this.legalFlight = undefined;
    });
    this.legalFlight = pending;
    return pending;
  },
  async save() {
    if (!this.data.editing || this.data.saving || this.data.loading || this.data.legalLoading || !isActivityUser(this.data.user)) return;
    if (!isSessionCurrent(this.loadedSession)) {
      epoch.invalidate();
      this.readerDraft = null;
      this.setData({ user: null, activityUser: false, editing: false, draft: emptyDraft(),
        legal: null, consent: false, error: "账号已改变，请重新读取资料" });
      return;
    }
    const draft = {
      realName: this.data.draft.realName.trim(),
      phone: this.data.draft.phone.trim(),
    };
    const validation = profileInputError(draft.realName, draft.phone);
    if (validation) {
      this.setData({ fieldError: validation });
      return;
    }
    if (!this.data.consent || !this.data.legal) {
      this.setData({ fieldError: "请主动同意当前隐私政策和用户协议" });
      return;
    }
    const n = epoch.next(),
      session = sessionVersion(),
      userId = this.data.user.id;
    this.setData({ saving: true, fieldError: "" });
    try {
      const versions = versionsOf(this.data.legal),
        latest = await currentLegal();
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      if (!sameVersions(versions, versionsOf(latest))) {
        this.setData({ legal: latest, consent: false });
        throw new Error("协议版本已更新，请重新确认是否同意");
      }
      const user = await request<User>("/me/profile", "PUT", { ...draft, ...versions });
      if (!epoch.valid(n) || !isSessionCurrent(session)) return;
      if (
        !user ||
        user.id !== userId ||
        !isActivityUser(user) ||
        user.profileCompleted !== true ||
        user.realName !== draft.realName ||
        user.phone !== draft.phone
      )
        throw new Error("资料保存结果未确认，请重新读取后再试");
      this.setData({
        user,
        editing: false,
        draft: emptyDraft(),
        consent: false,
        notice: this.data.fromRegister ? "资料已保存，请返回报名继续。" : "资料已保存。",
      });
      this.getOpenerEventChannel?.().emit?.("profileSaved", { id: user.id });
      if (this.data.fromRegister)
        wx.navigateBack({ fail: () => this.setData({ notice: "资料已保存，请返回报名继续。" }) });
    } catch (error) {
      if (epoch.valid(n)) {
        if (!hasSession() || !isSessionCurrent(session)) {
          this.readerDraft = null;
          this.setData({ loggedIn: hasSession(), user: null, activityUser: false, legal: null,
            editing: false, draft: emptyDraft(), consent: false, error: "登录状态已改变，请重新微信登录" });
          return;
        }
        if (error instanceof ApiError && ["LEGAL_VERSION_CHANGED", "LEGAL_NOT_READY"].includes(error.code)) {
          this.setData({ legal: null, consent: false });
          await this.loadEditorLegal();
        }
        if (epoch.valid(n) && isSessionCurrent(session)) this.setData({ fieldError: message(error) });
      }
    } finally {
      if (epoch.valid(n)) this.setData({ saving: false });
    }
  },
  finish() {
    if (this.data.saving) return;
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/mine/index" }) });
  },
});
