import { enterPage } from "../../utils/page-motion";
import { ApiError, request, isSessionCurrent, sessionVersion, isAccessDenied } from "../../utils/api";
import { message, safeId } from "../../utils/domain";
import { PageResult, Participant } from "../../utils/models";
import { requireAdmin } from "../admin-editor/shared";
interface ActivityOrder { id: string; orderNo: string; activityTitle: string; status: string; partySize: number; totalCents: number; }
// Refund endpoints deliberately return database maps (snake_case), unlike order DTOs.
interface Confirmation { kind:"order"|"refund"|"request"|"participants"; id:string; action:string; title:string; content:string; epoch:number; session:number; note:string; refundId?:string; version?:number; }
interface Refund { id?: string; status?: string; version?: number; amount_cents?: number; reason?: string; decision_note?: string; }
const labels: Record<string, string> = { PENDING_PAYMENT:"待付款", PAID:"已付款", CANCELLED:"已取消", CONFIRMED_FREE:"免付已确认", REFUND_PENDING:"退款处理中", REFUNDED:"已退款", REQUESTED:"待审核", PROCESSING:"退款处理中", UNKNOWN:"退款结果待核对", ABNORMAL:"退款异常", SUCCESS:"退款成功", REJECTED:"已拒绝", CLOSED:"已关闭" };
export const statusLabel = (s: string) => labels[s] || "状态待核对";
Page({
  data: { pageMotionClass: "", requestReason:"", canRequestRefund:false, activityId:"", participantsOrder:"", participants:[] as Participant[], participantsRevealed:false, authorized:false, loading:false, busy:false, error:"", orders: [] as (ActivityOrder & {statusText:string; amount:string})[], page:0, hasMore:false, selected:"", refund:null as (Refund & {statusText:string; amount:string}) | null, note:"", blocked:false, confirmation:null as Confirmation | null },
  _epoch:0, _session:-1, _alive:true, _invalid:false,
  onLoad(query:Record<string,string>) {
    if(query.activityId && !safeId(query.activityId)) { this._invalid=true; this.setData({error:"活动编号无效"}); return; }
    this.setData({activityId:safeId(query.activityId)});
  },
  onShow() { enterPage(this); void this.load(true); },
  onHide() { this.clearPrivate(); },
  onUnload() { this._alive=false; this.clearPrivate(); },
  clearPrivate() {
    this._epoch++;
    this.setData({authorized:false,loading:false,busy:false,orders:[],selected:"",refund:null,note:"",requestReason:"",canRequestRefund:false,confirmation:null,participantsOrder:"",participants:[],participantsRevealed:false,page:0,hasMore:false,blocked:false});
  },
  checkAccess(n: number, session: number, error?: unknown): boolean {
    if (!this._alive || n !== this._epoch) return false;
    if (isSessionCurrent(session) && !isAccessDenied(error)) return true;
    this.clearPrivate();
    this.setData({ error: error ? message(error) : "管理员会话已改变，请重新验证身份" });
    return false;
  },
  canAct(): boolean {
    return this.data.authorized && this.checkAccess(this._epoch, this._session) &&
      !this.data.loading && !this.data.busy;
  },
  valid(n:number,s:number) { return this._alive && n===this._epoch && isSessionCurrent(s); },
  async load(reset=true) {
    if (this._invalid || this.data.loading || this.data.busy || (!reset && !this.data.hasMore)) return;
    const s=sessionVersion();
    if (!reset && s!==this._session) {
      this.checkAccess(this._epoch, this._session);
      return;
    }
    const n=++this._epoch;
    this.setData({loading:true,error:"",requestReason:"",canRequestRefund:false,confirmation:null,participantsOrder:"",participants:[],participantsRevealed:false, ...(reset ? {orders:[], selected:"",refund:null,note:"",authorized:false,page:0,hasMore:false} : {})});
    try {
      const checked=await requireAdmin();
      if (!this.valid(n,s) || checked!==s) return;
      this._session=s;
      const page=reset ? 0 : this.data.page+1;
      const result=await request<PageResult<ActivityOrder>>(`/admin/activity-orders?page=${page}&size=20${this.data.activityId ? "&activityId="+encodeURIComponent(this.data.activityId) : ""}`);
      if (!this.valid(n,s)) return;
      const rows=result.items.map(o=>({...o,statusText:statusLabel(o.status),amount:(o.totalCents/100).toFixed(2)}));
      this.setData({authorized:true,orders:reset?rows:this.data.orders.concat(rows),page:result.page,hasMore:result.hasMore,blocked:false});
    } catch(e) { if(this.checkAccess(n,s,e)) this.setData({error:message(e)}); }
    finally { if(this.checkAccess(n,s)) this.setData({loading:false}); }
  },
  refresh() { void this.load(true); },
  more() { return this.load(false); },
  login() { wx.navigateTo({url:"/pages/admin-login/index"}); },
  noteInput(e:WechatMiniprogram.Input) { if(!this.data.busy && !this.data.confirmation) this.setData({note:e.detail.value}); },
  showRefund(r:Refund) {
    const order=this.data.orders.find(o=>o.id===this.data.selected);
    this.setData({refund:r.status ? {...r,statusText:statusLabel(r.status),amount:((r.amount_cents||0)/100).toFixed(2)} : null,
      canRequestRefund:order?.status==="PAID" && (!r.status || ["REJECTED","CLOSED"].includes(r.status))});
  },
  requestReasonInput(e:WechatMiniprogram.Input) {if(!this.data.busy && !this.data.confirmation) this.setData({requestReason:e.detail.value});},
  async inspect(e:WechatMiniprogram.TouchEvent) {
    const id=safeId(e.currentTarget.dataset.id);
    if(!this.canAct() || !this.data.orders.some(o=>o.id===id)) return;
    const n=this._epoch,s=this._session;
    this.setData({busy:true,confirmation:null,selected:id,refund:null,note:"",requestReason:"",canRequestRefund:false,error:"",blocked:true});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const r=await request<Refund>(`/admin/activity-orders/${id}/refund`);
      if(!this.valid(n,s)) return;
      this.showRefund(r); this.setData({blocked:false});
    } catch(e) { if(this.checkAccess(n,s,e)) this.setData({error:message(e)}); }
    finally { if(this.checkAccess(n,s)) this.setData({busy:false}); }
  },
  async toggleParticipants(e:WechatMiniprogram.TouchEvent) {
    const id=safeId(e.currentTarget.dataset.id);
    if(!id || !this.canAct() || this.data.confirmation) return;
    if(this.data.participantsOrder===id) {this.setData({participantsOrder:"",participants:[],participantsRevealed:false});return;}
    if(!this.data.orders.some(o=>o.id===id)) return;
    await this.loadParticipants(id, false);
  },
  askRevealParticipants(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (!this.canAct() || !id || id !== this.data.participantsOrder || this.data.participantsRevealed || this.data.confirmation) return;
    this.setData({ confirmation: { kind:"participants",id,action:"reveal",title:"查看完整姓名与手机号？",content:"仅用于本次活动联系和组织。此操作将记录，身份证号仍会遮挡。",epoch:this._epoch,session:this._session,note:"" } });
  },
  async loadParticipants(id: string, reveal: boolean) {
    const n=this._epoch,s=this._session;
    this.setData({busy:true,error:"",...(reveal?{}:{participantsOrder:"",participants:[],participantsRevealed:false})});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const path = `/admin/activity-orders/${id}/participants`;
      const participants=await request<Participant[]>(reveal ? path + "/reveal" : path, reveal ? "POST" : "GET");
      if(!this.valid(n,s)) return;
      this.setData({participantsOrder:id,participants,participantsRevealed:reveal});
    } catch(e) {
      if(this.checkAccess(n,s,e)) this.setData({error:message(e)});
    } finally {
      if(this.checkAccess(n,s)) this.setData({busy:false});
    }
  },
  cancelConfirmation() { if(!this.data.busy) this.setData({confirmation:null}); },
  async confirmAction() {
    const c=this.data.confirmation;
    if(!c || !this.canAct()) return;
    this.setData({confirmation:null});
    if(!this.valid(c.epoch,c.session) || c.session!==this._session) return;
    const event={currentTarget:{dataset:{id:c.id,action:c.action}}} as unknown as WechatMiniprogram.TouchEvent;
    if(c.kind==="participants") {
      if(c.id===this.data.participantsOrder && !this.data.participantsRevealed) await this.loadParticipants(c.id,true);
    } else if(c.kind==="request") {
      if(c.id===this.data.selected && c.refundId===this.data.refund?.id && c.version===this.data.refund?.version && c.note===this.data.requestReason.trim()) await this.requestRefund(true);
    } else if(c.kind==="order") await this.orderAction(event,true);
    else if(c.id===this.data.selected && c.refundId===this.data.refund?.id && c.version===this.data.refund?.version && c.note===this.data.note.trim()) await this.decide(event,true);
  },
  prepareRefundRequest() {return this.requestRefund(false);},
  async requestRefund(confirmed=false) {
    const id=this.data.selected, order=this.data.orders.find(o=>o.id===id), r=this.data.refund;
    if(!this.canAct() || !order || order.status!=="PAID" || !this.data.canRequestRefund || this.data.blocked) return;
    if(r?.status && !["REJECTED","CLOSED"].includes(r.status)) return;
    const reason=this.data.requestReason.trim();
    if(!reason || reason.length>200) {this.setData({error:"请填写 1–200 字退款原因"});return;}
    const n=this._epoch,s=this._session;
    if(!confirmed) {
      if(this.data.confirmation) return;
      this.setData({confirmation:{kind:"request",id,action:"request",epoch:n,session:s,note:reason,refundId:r?.id,version:r?.version,title:"发起全额退款申请？",content:`订单 ${order.orderNo}，全额 ¥${order.amount}。原因：${reason}。提交后进入待审核，仍须批准并由微信确认退款结果。`}});return;
    }
    this.setData({busy:true,error:""});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const result=await request<Refund>(`/admin/activity-orders/${id}/refund`,"POST",{reason});
      if(!this.valid(n,s)) return;
      this.setData({requestReason:"",orders:this.data.orders.map(o=>o.id===id && result.status==="REQUESTED"?{...o,status:"REFUND_PENDING",statusText:statusLabel("REFUND_PENDING")}:o)});
      this.showRefund(result);
    } catch(e) {
      if(!this.checkAccess(n,s,e)) return;
      this.setData({blocked:true,canRequestRefund:false,error:"退款申请失败或结果未知，请重新查看退款核对，勿重复提交"});
    } finally {if(this.checkAccess(n,s)) this.setData({busy:false});}
  },
  async orderAction(e:WechatMiniprogram.TouchEvent, confirmed=false) {
    const id=safeId(e.currentTarget.dataset.id), action=String(e.currentTarget.dataset.action);
    const order=this.data.orders.find(o=>o.id===id);
    if(!this.canAct() || !order || this.data.blocked) return;
    if(action==="cancel" ? !["CONFIRMED_FREE","PENDING_PAYMENT"].includes(order.status) : action!=="verify" || order.status!=="PENDING_PAYMENT") return;
    const n=this._epoch,s=this._session;
    if (!confirmed) {
      if (this.data.confirmation) return;
      this.setData({confirmation:{kind:"order",id,action,epoch:n,session:s,note:"",title:action==="cancel"?(order.status==="CONFIRMED_FREE"?"取消免付报名？":"关闭待付款订单？"):"核对支付结果？",content:action==="cancel"?(order.status==="CONFIRMED_FREE"?`订单 ${order.orderNo}：将取消报名并释放名额，不涉及支付退款。`:`订单 ${order.orderNo}：先确认微信关单成功，再释放报名名额。关单失败或结果未知时保留原状态与名额，请核对后再操作。`):`订单 ${order.orderNo}，将向支付渠道核对结果。`}}); return;
    }
    this.setData({busy:true,error:""});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const result=await request<ActivityOrder>(`/admin/activity-orders/${id}/${action}`,"POST",{});
      if(!this.valid(n,s)) return;
      this.setData({orders:this.data.orders.map(o=>o.id===id?{...result,statusText:statusLabel(result.status),amount:(result.totalCents/100).toFixed(2)}:o)});
    } catch(e) {
      if(this.checkAccess(n,s,e)) this.setData({blocked:true,error:"操作结果待核对，请刷新订单后再操作"});
    } finally { if(this.checkAccess(n,s)) this.setData({busy:false}); }
  },
  async decide(e:WechatMiniprogram.TouchEvent, confirmed=false) {
    const action=String(e.currentTarget.dataset.action), r=this.data.refund, id=this.data.selected;
    if(!this.canAct()||this.data.blocked||!r||!id) return;
    if(!["approve","reject","verify","retry"].includes(action)) return;
    if(action==="verify" ? !["PROCESSING","UNKNOWN","ABNORMAL"].includes(r.status||"") : action==="retry" ? !["PROCESSING","UNKNOWN"].includes(r.status||"") : r.status!=="REQUESTED") return;
    const refundId = safeId(r.id), version = r.version;
    if (!refundId || typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
      this.setData({ blocked:true,error:"退款信息缺少有效编号或版本，请重新查看退款" });
      return;
    }
    const note=this.data.note.trim();
    if(action==="reject" && (!note || note.length>200)) {this.setData({error:"请填写 1–200 字拒绝原因"});return;}
    const n=this._epoch,s=this._session;
    if (!confirmed) {
      if (this.data.confirmation) return;
      this.setData({confirmation:{kind:"refund",id,action,epoch:n,session:s,note,refundId,version,title:action==="approve"?"确认批准退款？":action==="reject"?"确认拒绝退款？":action==="retry"?"使用原退款单号重试？":"核对退款结果？",content:`订单 ${id}，退款金额 ¥${r.amount}。${action==="reject"?"拒绝原因："+note:"申请原因："+(r.reason||"")}`}}); return;
    }
    this.setData({busy:true,error:""});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const result=await request<Refund>(`/admin/activity-orders/${id}/refund/${action}`,"POST",{refundId,version,...(action==="reject"?{note}:{})});
      if(!this.valid(n,s)) return;
      this.setData({orders:this.data.orders.map(o=>o.id===id && ["REJECTED","CLOSED","SUCCESS"].includes(result.status||"")?{...o,status:result.status==="SUCCESS"?"REFUNDED":"PAID",statusText:statusLabel(result.status==="SUCCESS"?"REFUNDED":"PAID")}:o)});
      this.showRefund(result); this.setData({note:""});
    } catch(e) {
      if(!this.checkAccess(n,s,e)) return;
      this.setData({blocked:true,error:e instanceof ApiError && e.status===409?"退款申请已变化，请重新查看退款后操作":"操作失败或结果未知，请重新查看退款核对，勿重复操作"});
    } finally { if(this.checkAccess(n,s)) this.setData({busy:false}); }
  },
});
