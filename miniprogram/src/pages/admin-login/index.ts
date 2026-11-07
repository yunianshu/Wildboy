import { adminLogin } from "../../utils/api";
import { getAdminLoginCapability } from "../../utils/admin-capability";
import { message } from "../../utils/domain";
import { enterPage } from "../../utils/page-motion";

Page({
  data: {
    pageMotionClass: "",
    username: "",
    password: "",
    busy: false,
    error: "",
    // pending: 入口状态核对中；ready: 已核对；error: 核对失败可重试。
    capabilityState: "pending",
    adminLoginEnabled: false,
  },
  _epoch: 0,
  _visible: true as boolean,
  onShow() {
    enterPage(this);
    this._visible = true;
    void this.loadCapability();
  },
  onHide() {
    this._visible = false;
    this._epoch++;
    // A late capability or login response must never reopen a hidden page.
    this.setData({ password: "", busy: false });
  },
  onUnload() {
    this._epoch++;
    this.setData({ password: "" });
  },
  async loadCapability() {
    const n = ++this._epoch;
    this.setData({ capabilityState: "pending", adminLoginEnabled: false, error: "" });
    try {
      const enabled = await getAdminLoginCapability();
      if (n !== this._epoch || this._visible === false) return;
      this.setData({ capabilityState: "ready", adminLoginEnabled: enabled });
    } catch (e) {
      if (n !== this._epoch || this._visible === false) return;
      this.setData({
        capabilityState: "error",
        adminLoginEnabled: false,
        error: message(e),
      });
    }
  },
  input(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field;
    if (field === "username" || field === "password")
      this.setData({ [field]: e.detail.value });
  },
  async submit() {
    // The entry stays closed until the server confirms it is configured.
    if (!this.data.adminLoginEnabled || this.data.busy) return;
    const username = this.data.username.trim(),
      password = this.data.password;
    if (!username || !password) {
      this.setData({ error: "请填写管理员账号与密码" });
      return;
    }
    const epoch = ++this._epoch;
    this.setData({ busy: true, error: "" });
    try {
      await adminLogin(username, password, () => epoch === this._epoch);
      if (epoch !== this._epoch) return;
      this.setData({ password: "", busy: false });
      wx.redirectTo({ url: "/pages/admin-activities/index" });
    } catch (e) {
      if (epoch === this._epoch)
        this.setData({ error: message(e), password: "", busy: false });
    }
  },
  back() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
