import { enterPage } from "../../utils/page-motion";
import { request, isSessionCurrent, isAccessDenied, sessionVersion, ApiError } from '../../utils/api';
import { requireAdmin } from '../admin-editor/shared';
import { message } from '../../utils/domain';
import { MembershipTier, MembershipUser, emptyTier, tierForm, tierInput, customerTypes, customerLabels, modeLabels, participantPolicies, identityLabel } from '../../utils/membership';
type Draft = {session:number; form:ReturnType<typeof emptyTier>; editId:string; editVersion:number|null; blocked:boolean};
type Row = MembershipUser & { identity: string; typeIndex: number; tierIndex: number };
Page({
  data: { pageMotionClass: "",
    dirty: false, pendingChange: '', pendingEditId: '',
    authorized: false, loading: false, saving: false, error: '', notice: '', section: 'tiers',
    tiers: [] as MembershipTier[], enabledTiers: [] as MembershipTier[], tierNames: ['请选择等级'],
    editId: '', editVersion: null as number | null, form: emptyTier(), modeLabels, participantPolicies, customerLabels,
    blocked: false, query: '', filterIndex: 0, filters: ['全部身份', ...customerLabels],
    users: [] as Row[], page: 0, hasMore: false, usersLoading: false, savingUser: '',
  },
  _epoch: 0, _session: -1, _search: 0, _draft: null as Draft | null,
  onShow() { enterPage(this); void this.load(true); },
  onHide() {
    this._draft = this.data.dirty && isSessionCurrent(this._session) ? {session:this._session,form:this.data.form,editId:this.data.editId,editVersion:this.data.editVersion,blocked:this.data.blocked||this.data.saving} : null;
    this.clear();
  },
  onUnload() {this._draft=null;this.clear();},
  markDirty() {this.setData({dirty:true}); if(typeof wx.enableAlertBeforeUnload==='function')wx.enableAlertBeforeUnload({message:'会员等级有未保存修改，确认离开？'});},
  cleanDraft() {this.setData({dirty:false,pendingChange:'',pendingEditId:''});this._draft=null;if(typeof wx.disableAlertBeforeUnload==='function')wx.disableAlertBeforeUnload();},
  requestReload() {if(this.data.saving||this.data.savingUser)return;if(this.data.dirty){this.setData({pendingChange:'reload',pendingEditId:''});return;}void this.load();},
  dismissChange() {this.setData({pendingChange:'',pendingEditId:''});},
  confirmChange() {
    if(!this.data.authorized||!isSessionCurrent(this._session)||this.data.saving)return;
    const action=this.data.pendingChange,id=this.data.pendingEditId;this.cleanDraft();
    if(action==='reload')void this.load();else if(action==='create')this.create();else if(action==='edit')this.edit({currentTarget:{dataset:{id}}} as unknown as WechatMiniprogram.TouchEvent);
  },
  clear() { this._epoch++; this._search++; const saved=this._draft;this.cleanDraft();this._draft=saved; this.setData({ authorized: false, tiers: [], users: [], enabledTiers: [], tierNames: ['请选择等级'], form: emptyTier(), editId: '', editVersion: null, loading: false, saving: false, savingUser: '', usersLoading: false, blocked: false, query:'', filterIndex:0, page:0, hasMore:false, notice:'' }); },
  current(n: number, s: number) { return n === this._epoch && isSessionCurrent(s); },
  checkAccess(n: number, session: number, error?: unknown): boolean {
    if (n !== this._epoch) return false;
    if (isSessionCurrent(session) && !isAccessDenied(error)) return true;
    this._draft = null;
    this.clear();
    this.setData({ error: error ? message(error) : "管理员会话已改变，请重新验证身份" });
    return false;
  },
  canAct(): boolean {
    return this.data.authorized && this.checkAccess(this._epoch, this._session);
  },
  login() { wx.navigateTo({ url: "/pages/admin-login/index" }); },
  async load(restore=false) {
    const s = sessionVersion();
    if (this._session !== -1 && this._session !== s) this.checkAccess(this._epoch, this._session);
    const saved=restore?this._draft:null;this.cleanDraft();
    const n = ++this._epoch;
    this.setData({ authorized: false, loading: true, error: '', notice: '', users: [], tiers: [], form: emptyTier(), editId: '', editVersion: null, blocked: false });
    try {
      const checked = await requireAdmin();
      if (!this.current(n,s) || checked !== s) return;
      this._session = s;
      const tiers = await request<MembershipTier[]>('/admin/membership/tiers');
      if (!this.current(n,s)) return;
      const enabledTiers = tiers.filter(x => x.enabled);
      this.setData({ authorized: true, tiers, enabledTiers, tierNames: ['请选择等级', ...enabledTiers.map(x=>x.name)] });
      if(saved && saved.session===s){this.setData({form:saved.form,editId:saved.editId,editVersion:saved.editVersion,blocked:saved.blocked,notice:saved.blocked?'上次保存结果待核对，请刷新后再操作。':'已恢复未保存修改'});this.markDirty();}
      if(this.data.section === 'users') await this.search();
    } catch(e) { if(this.checkAccess(n,s,e)) this.setData({ error: message(e), authorized: false }); }
    finally { if(this.checkAccess(n,s)) this.setData({ loading: false }); }
  },
  section(e: WechatMiniprogram.TouchEvent) { if(this.data.saving || this.data.savingUser) return; const section = e.currentTarget.dataset.section; this.setData({ section }); if(section === 'users') void this.search(); },
  create() { if(this.data.saving)return;if(this.data.dirty){this.setData({pendingChange:'create',pendingEditId:''});return;}this.cleanDraft();this.setData({ editId: '', editVersion: null, form: emptyTier(), blocked: false, error: '', notice: '' }); },
  edit(e: WechatMiniprogram.TouchEvent) { if(this.data.saving) return;if(this.data.dirty){this.setData({pendingChange:'edit',pendingEditId:e.currentTarget.dataset.id});return;}this.cleanDraft(); const t = this.data.tiers.find(x=>x.id===e.currentTarget.dataset.id); if(t) this.setData({ editId: t.id, editVersion: t.version, form: tierForm(t), blocked: false, error: '', notice: '' }); },
  field(e: WechatMiniprogram.Input) { if(this.data.saving || this.data.blocked) return; const key = e.currentTarget.dataset.key; if(key === 'name' || key === 'sortOrder') {this.setData({ form: { ...this.data.form, [key]: e.detail.value } });this.markDirty();} },
  enabled(e: WechatMiniprogram.SwitchChange) { if(!this.data.saving && !this.data.blocked) {this.setData({ form: { ...this.data.form, enabled: e.detail.value } });this.markDirty();} },
  rule(e: WechatMiniprogram.Input | WechatMiniprogram.SwitchChange | WechatMiniprogram.PickerChange) {
    if(this.data.saving || this.data.blocked) return;
    const i = Number(e.currentTarget.dataset.index), key = e.currentTarget.dataset.key;
    if(!Number.isInteger(i) || i < 0 || i >= this.data.form.rules.length || !['enabled','mode','value','participantPolicy'].includes(key)) return;
    const rules = this.data.form.rules.map((r,j)=>j===i ? { ...r, [key]: (key === 'mode' || key === 'participantPolicy') ? Number(e.detail.value) : e.detail.value } : r);
    this.setData({ form: { ...this.data.form, rules } });this.markDirty();
  },
  async save() {
    if(!this.canAct() || this.data.saving || this.data.blocked) return;
    let body; try { body = tierInput(this.data.form, this.data.editVersion); } catch(e) { this.setData({error:message(e)}); return; }
    const n = this._epoch, originalSession = this._session, id = this.data.editId;
    this.setData({ saving: true, error: '', notice: '' });
    let sent = false;
    try {
      const s = await requireAdmin();
      if(!this.current(n,originalSession) || s !== originalSession) return;
      sent = true;
      const tier = await request<MembershipTier>(id ? `/admin/membership/tiers/${encodeURIComponent(id)}` : '/admin/membership/tiers', id ? 'PUT' : 'POST', body);
      if(!this.current(n,s)) return;
      const tiers = [...this.data.tiers.filter(x=>x.id!==tier.id), tier].sort((a,b)=>a.sortOrder-b.sortOrder), enabledTiers = tiers.filter(x=>x.enabled);
      this.setData({ tiers, enabledTiers, tierNames: ['请选择等级', ...enabledTiers.map(x=>x.name)], editId: tier.id, editVersion: tier.version, form: tierForm(tier), notice: '已保存' });this.cleanDraft();
    } catch(e) {
      if(this.checkAccess(n,originalSession,e)) {
        const duplicate = e instanceof ApiError && e.code === "TIER_NAME_EXISTS";
        const conflict = e instanceof ApiError && e.status === 409 && !duplicate;
        // Network failures can occur after the server commits. Block retry until a fresh read.
        const uncertain = sent && (!(e instanceof ApiError) || e.status === 0 || e.status === 408 || e.status >= 500);
        const blocked = conflict || uncertain;
        this.setData({ error: conflict ? '配置已被修改，请刷新后核对再编辑' : message(e), blocked, notice: blocked ? '请刷新列表核对保存结果，避免重复提交。' : '' });
      }
    } finally { if(this.checkAccess(n,originalSession)) this.setData({saving:false}); }
  },
  query(e: WechatMiniprogram.Input) { this._search++; this.setData({query:e.detail.value, users:[], hasMore:false, usersLoading:false}); },
  filter(e: WechatMiniprogram.PickerChange) { this.setData({filterIndex:Number(e.detail.value)}); void this.search(); },
  async search() { await this.fetchUsers(false); },
  async more() { if(this.data.hasMore) await this.fetchUsers(true); },
  async fetchUsers(more: boolean) {
    if(!this.canAct() || (more && this.data.usersLoading)) return;
    const query = this.data.query.trim();
    if(query.length > 80) { this.setData({error:'搜索内容最多 80 字'}); return; }
    const n = this._epoch, s = this._session, seq = ++this._search, page = more ? this.data.page+1 : 0;
    this.setData({ usersLoading:true, error:'', ...(more ? {} : {users:[], hasMore:false}) });
    try {
      const filter = customerTypes[this.data.filterIndex-1] || '';
      const result = await request<{items:MembershipUser[];page:number;hasMore:boolean}>(`/admin/membership/users?query=${encodeURIComponent(query)}&customerType=${filter}&page=${page}&size=20`);
      if(!this.current(n,s) || seq!==this._search) return;
      const rows = result.items.map(u=>({...u,identity:identityLabel(u),typeIndex:customerTypes.indexOf(u.customerType),tierIndex:this.data.enabledTiers.findIndex(t=>t.id===u.tierId)+1}));
      this.setData({users:more ? [...this.data.users,...rows] : rows,page:result.page,hasMore:result.hasMore});
    } catch(e) { if(this.checkAccess(n,s,e) && seq===this._search) this.setData({error:message(e)}); }
    finally { if(this.checkAccess(n,s) && seq===this._search) this.setData({usersLoading:false}); }
  },
  userField(e: WechatMiniprogram.PickerChange) {
    if(this.data.savingUser) return;
    const id = e.currentTarget.dataset.id, key = e.currentTarget.dataset.key;
    if(key!=='typeIndex' && key!=='tierIndex') return;
    this.setData({users:this.data.users.map(u=>u.id===id ? {...u,[key]:Number(e.detail.value)} : u)});
  },
  async saveUser(e: WechatMiniprogram.TouchEvent) {
    if(!this.canAct() || this.data.savingUser) return;
    const u = this.data.users.find(x=>x.id===e.currentTarget.dataset.id); if(!u) return;
    const customerType = customerTypes[u.typeIndex], tier = this.data.enabledTiers[u.tierIndex-1];
    if(!customerType || (customerType==='MEMBER' && !tier)) {this.setData({error:'会员必须选择启用的等级'});return;}
    const n = this._epoch, s = this._session, seq = this._search;
    this.setData({savingUser:u.id,error:'',notice:''});
    try {
      const fresh = await requireAdmin(); if(!this.current(n,s) || fresh!==s || seq!==this._search) return;
      await request(`/admin/membership/users/${encodeURIComponent(u.id)}`,'PUT',{customerType,tierId:customerType==='MEMBER' ? tier.id : null,version:u.version});
      if(!this.current(n,s) || seq!==this._search) return;
      this.setData({notice:'身份已保存'}); await this.search();
    } catch(e) {
      if(this.checkAccess(n,s,e) && seq===this._search) this.setData({users:[],hasMore:false,error:e instanceof ApiError && e.status===409 ? '用户身份已被修改，请重新搜索后核对' : message(e),notice:'请重新搜索核对结果后再操作。'});
    } finally {if(this.checkAccess(n,s)) this.setData({savingUser:''});}
  },
});
