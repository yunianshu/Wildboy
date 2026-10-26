import { adminLogin } from "../../utils/api";
import { message } from "../../utils/domain";
Page({
  data: { username: "", password: "", busy: false, error: "" },
  _epoch: 0,
  onHide() {
    this._epoch++;
    this.setData({ password: "", busy: false });
  },
  onUnload() {
    this._epoch++;
    this.setData({ password: "" });
  },
  input(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field;
    if (field === "username" || field === "password")
      this.setData({ [field]: e.detail.value });
  },
  async submit() {
    if (this.data.busy) return;
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
      this.setData({ password: "" });
      wx.redirectTo({ url: "/pages/admin-activities/index" });
    } catch (e) {
      if (epoch === this._epoch)
        this.setData({ error: message(e), password: "" });
    } finally {
      if (epoch === this._epoch) this.setData({ busy: false });
    }
  },
  back() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
