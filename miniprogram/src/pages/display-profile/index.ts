import { getCurrentUser, hasSession, isSessionCurrent, request, sessionVersion } from "../../utils/api";
import { displayAvatar, markDisplayProfileSeen, readAvatarBase64 } from "../../utils/display-profile";
import { message } from "../../utils/domain";
import { User } from "../../utils/models";
import { enterPage } from "../../utils/page-motion";

function supportsAvatarReview(): boolean {
  try {
    const version = (typeof wx.getAppBaseInfo === "function" ? wx.getAppBaseInfo() : wx.getSystemInfoSync()).SDKVersion;
    const parts = version.split(".").map(Number);
    return parts[0] > 2 || parts[0] === 2 && (parts[1] > 24 || parts[1] === 24 && parts[2] >= 4);
  } catch { return false; }
}

Page({
  data: { pageMotionClass: "", user: null as User | null, loading: true, saving: false,
    nickname: "", avatarPreview: "", avatarPath: "", error: "", saved: false, onboarding: false, canChooseAvatar: false, canReviewNickname: false,
    reviewing: false, reviewedNickname: "", inputKeys: [0] },
  pendingNickname: "",
  inputGeneration: 0,
  alive: true,
  visible: false,
  epoch: 0,
  loadedSession: -1,
  onLoad(options: Record<string, string>) {
    this.setData({ onboarding: options.from === "login",
      canChooseAvatar: typeof wx.canIUse === "function" && wx.canIUse("button.open-type.chooseAvatar") && wx.canIUse("input.bindnicknamereview") && supportsAvatarReview(),
      canReviewNickname: typeof wx.canIUse === "function" && wx.canIUse("input.bindnicknamereview") });
    void this.load();
  },
  onShow() {
    enterPage(this);
    this.visible = true;
    if (this.loadedSession >= 0 && !isSessionCurrent(this.loadedSession)) this.clearAccount();
    else if (this.data.saved) this.finish();
  },
  // The native avatar picker can hide this page. Keep its draft and operation alive.
  onHide() { this.visible = false; },
  onUnload() { this.alive = false; this.epoch++; },
  clearAccount() {
    this.epoch++;
    this.pendingNickname = "";
    this.inputGeneration++;
    this.loadedSession = -1;
    this.setData({ user: null, loading: false, saving: false, nickname: "", avatarPath: "", avatarPreview: "", saved: false,
      reviewing: false, reviewedNickname: "", inputKeys: [this.inputGeneration],
      error: "登录状态已改变，请返回后重新登录" });
  },
  async load() {
    const n = ++this.epoch, session = sessionVersion();
    this.pendingNickname = "";
    this.inputGeneration++;
    this.setData({ loading: true, error: "", reviewing: false, reviewedNickname: "", inputKeys: [this.inputGeneration] });
    try {
      if (!hasSession()) throw new Error("请先微信登录");
      const user = await getCurrentUser();
      if (!this.alive || n !== this.epoch) return;
      if (!isSessionCurrent(session)) { this.clearAccount(); return; }
      if (user.accountSource !== "WECHAT" || !user.wechatVerified) throw new Error("仅微信登录账号可编辑头像昵称");
      this.loadedSession = session;
      this.setData({ user, nickname: user.displayProfileCompleted || user.nickname !== "微信用户" ? user.nickname : "",
        avatarPreview: displayAvatar(user), avatarPath: "" });
    } catch (error) {
      if (this.alive && n === this.epoch) this.setData({ error: message(error) });
    } finally { if (this.alive && n === this.epoch) this.setData({ loading: false }); }
  },
  inputNickname(event: WechatMiniprogram.Input) {
    if (!this.data.saving && !this.data.reviewing) this.setData({ nickname: event.detail.value, reviewedNickname: "", error: "" });
  },
  blurNickname(event: WechatMiniprogram.InputBlur) {
    if (this.data.saving || this.data.reviewing || !this.data.canReviewNickname) return;
    const nickname = event.detail.value.trim();
    this.setData({ nickname });
    if (!nickname || nickname === this.data.user?.nickname || nickname === this.data.reviewedNickname) return;
    this.pendingNickname = nickname;
    this.setData({ reviewing: true, reviewedNickname: "", error: "" });
  },
  reviewNickname(event: WechatMiniprogram.CustomEvent<{ pass?: boolean }>) {
    if (!this.data.reviewing || Number(event.currentTarget.dataset.reviewKey) !== this.inputGeneration) return;
    const passed = event.detail.pass === true && this.pendingNickname === this.data.nickname.trim();
    this.inputGeneration++;
    this.setData({ reviewing: false, reviewedNickname: passed ? this.pendingNickname : "",
      inputKeys: [this.inputGeneration], error: passed ? "" : "昵称未通过微信审核，请修改或暂时跳过" });
    this.pendingNickname = "";
  },
  resetNicknameReview() {
    if (this.data.saving) return;
    this.inputGeneration++;
    this.pendingNickname = "";
    this.setData({ reviewing: false, reviewedNickname: "", nickname: "", inputKeys: [this.inputGeneration], error: "" });
  },
  chooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    if (this.data.saving || !this.data.user || !this.data.canChooseAvatar) return;
    if (!isSessionCurrent(this.loadedSession)) { this.clearAccount(); return; }
    const path = event.detail.avatarUrl;
    if (typeof path !== "string" || !path) return;
    // 服务端按 1024×1024 上限解码；先本地预检尺寸，避免整图上传后才被拒绝。
    if (typeof wx.getImageInfo !== "function") { this.acceptAvatar(path); return; }
    wx.getImageInfo({
      src: path,
      success: info => {
        if (!this.data.canChooseAvatar || this.data.saving || !isSessionCurrent(this.loadedSession)) return;
        if ((info.width || 0) > 1024 || (info.height || 0) > 1024) {
          this.setData({ error: "头像图片需不超过 1024×1024，请裁剪后重新选择" });
          return;
        }
        this.acceptAvatar(path);
      },
      // 读取尺寸失败不拦选择：服务端仍是最终裁决方。
      fail: () => { if (this.data.canChooseAvatar && !this.data.saving && isSessionCurrent(this.loadedSession)) this.acceptAvatar(path); },
    });
  },
  acceptAvatar(path: string) {
    this.setData({ avatarPath: path, avatarPreview: path, error: "" });
  },
  avatarError() { this.setData({ avatarPreview: "" }); },
  async save() {
    if (this.data.loading || this.data.saving || !this.data.user) return;
    if (!isSessionCurrent(this.loadedSession)) { this.clearAccount(); return; }
    const nickname = this.data.nickname.trim();
    if (Array.from(nickname).length > 32 || /[\x00-\x1f\x7f]/.test(nickname)) {
      this.setData({ error: "昵称最多 32 个字，不能包含控制字符" }); return;
    }
    const payload: { nickname?: string; avatarBase64?: string } = {};
    if (nickname && nickname !== this.data.user.nickname) {
      if (!this.data.canReviewNickname || this.data.reviewing || this.data.reviewedNickname !== nickname) {
        this.setData({ error: this.data.canReviewNickname ? "请先收起键盘，等待昵称审核完成；也可暂时跳过" : "当前微信版本不支持昵称审核，请升级微信或暂时跳过" }); return;
      }
      payload.nickname = nickname;
    }
    const path = this.data.avatarPath;
    if (!payload.nickname && !path) { this.skip(); return; }
    const n = ++this.epoch, session = this.loadedSession, userId = this.data.user.id;
    const valid = () => this.alive && n === this.epoch && isSessionCurrent(session);
    this.setData({ saving: true, error: "" });
    try {
      if (path) payload.avatarBase64 = await readAvatarBase64(path);
      if (!valid()) { if (this.alive && n === this.epoch) this.clearAccount(); return; }
      const user = await request<User>("/me/display-profile", "PUT", payload);
      if (!valid()) { if (this.alive && n === this.epoch) this.clearAccount(); return; }
      if (user?.id !== userId || user.displayProfileCompleted !== true
          || (payload.nickname && user.nickname !== payload.nickname)
          || (path && !displayAvatar(user))) throw new Error("资料保存结果未确认，请重试或返回查看");
      markDisplayProfileSeen(userId);
      this.setData({ user, nickname: user.nickname, avatarPreview: displayAvatar(user), avatarPath: "", saved: true });
      if (this.visible) this.finish();
    } catch (error) {
      if (valid()) this.setData({ error: message(error) });
      else if (this.alive && n === this.epoch) this.clearAccount();
    } finally { if (this.alive && n === this.epoch) this.setData({ saving: false }); }
  },
  skip() {
    if (this.data.saving) return;
    if (this.data.user && isSessionCurrent(this.loadedSession)) markDisplayProfileSeen(this.data.user.id);
    this.finish();
  },
  finish() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: "/pages/mine/index" }) });
  },
  retry() { void this.load(); },
});
