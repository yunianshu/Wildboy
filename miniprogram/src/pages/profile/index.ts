import { request, hasSession, sessionVersion, isSessionCurrent } from '../../utils/api';
import { message } from '../../utils/domain';
import { MembershipUser, identityLabel } from '../../utils/membership';
Page({
  data: { loading: false, error: '', user: null as MembershipUser | null, identity: '' },
  _epoch: 0,
  onShow() { void this.load(); },
  onHide() { this._epoch++; this.setData({ user: null, identity: '', loading: false }); },
  onUnload() { this._epoch++; },
  async load() {
    const n = ++this._epoch, s = sessionVersion();
    this.setData({ loading: false, error: '', user: null, identity: '' });
    if (!hasSession()) { this.setData({ error: '请先登录查看我的身份' }); return; }
    this.setData({ loading: true });
    try { const user = await request<MembershipUser>('/me/membership'); if(n === this._epoch && isSessionCurrent(s)) this.setData({ user, identity: identityLabel(user) }); }
    catch(e) { if(n === this._epoch && isSessionCurrent(s)) this.setData({ error: message(e) }); }
    finally { if(n === this._epoch) this.setData({ loading: false }); }
  },
  login() { wx.navigateTo({ url: '/pages/login/index' }); },
});
