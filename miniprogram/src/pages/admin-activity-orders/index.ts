import { ApiError, request, isSessionCurrent } from "../../utils/api";
import { message, safeId } from "../../utils/domain";
import { PageResult, Participant } from "../../utils/models";
import { requireAdmin } from "../admin-editor/shared";
interface ActivityOrder { id: string; orderNo: string; activityTitle: string; status: string; partySize: number; totalCents: number; }
// Refund endpoints deliberately return database maps (snake_case), unlike order DTOs.
interface Confirmation { kind:"order"|"refund"|"request"; id:string; action:string; title:string; content:string; epoch:number; session:number; note:string; version?:number; }
interface Refund { status?: string; version?: number; amount_cents?: number; reason?: string; decision_note?: string; }
const labels: Record<string, string> = { PENDING_PAYMENT:"待付款", PAID:"已付款", CANCELLED:"已取消", CONFIRMED_FREE:"免付已确认", REFUND_PENDING:"退款处理中", REFUNDED:"已退款", REQUESTED:"待审核", PROCESSING:"退款处理中", UNKNOWN:"退款结果待核对", ABNORMAL:"退款异常", SUCCESS:"退款成功", REJECTED:"已拒绝", CLOSED:"已关闭" };
export const statusLabel = (s: string) => labels[s] || "状态待核对";
Page({
  data: { requestReason:"", canRequestRefund:false, activityId:"", participantsOrder:"", participants:[] as Participant[], authorized:false, loading:false, busy:false, error:"", orders: [] as (ActivityOrder & {statusText:string; amount:string})[], page:0, hasMore:false, selected:"", refund:null as (Refund & {statusText:string; amount:string}) | null, note:"", blocked:false, confirmation:null as Confirmation | null },
  _epoch:0, _session:-1, _alive:true, _invalid:false,
  onLoad(query:Record<string,string>) {
    if(query.activityId && !safeId(query.activityId)) { this._invalid=true; this.setData({error:"活动编号无效"}); return; }
    this.setData({activityId:safeId(query.activityId)});
  },
  onShow() { void this.load(true); },
  onHide() { this._epoch++; this.setData({authorized:false,loading:false,busy:false,orders:[],selected:"",refund:null,note:"",requestReason:"",canRequestRefund:false,confirmation:null,participantsOrder:"",participants:[]}); },
  onUnload() { this._alive=false; this._epoch++; this.setData({participantsOrder:"",participants:[]}); },
  valid(n:number,s:number) { return this._alive && n===this._epoch && isSessionCurrent(s); },
  async load(reset=true) {
    if (this._invalid || this.data.loading || this.data.busy || (!reset && !this.data.hasMore)) return;
    const n=++this._epoch;
    this.setData({loading:true,error:"",requestReason:"",canRequestRefund:false,confirmation:null,participantsOrder:"",participants:[], ...(reset ? {orders:[], selected:"",refund:null,note:"",authorized:false} : {})});
    try {
      const s=await requireAdmin();
      if (!this.valid(n,s)) return;
      if (!reset && s!==this._session) { this.setData({orders:[],authorized:false,error:"登录身份已改变，请刷新"}); return; }
      this._session=s;
      const page=reset ? 0 : this.data.page+1;
      const result=await request<PageResult<ActivityOrder>>(`/admin/activity-orders?page=${page}&size=20${this.data.activityId ? "&activityId="+encodeURIComponent(this.data.activityId) : ""}`);
      if (!this.valid(n,s)) return;
      const rows=result.items.map(o=>({...o,statusText:statusLabel(o.status),amount:(o.totalCents/100).toFixed(2)}));
      this.setData({authorized:true,orders:reset?rows:this.data.orders.concat(rows),page:result.page,hasMore:result.hasMore,blocked:false});
    } catch(e) { if(n===this._epoch) this.setData({error:message(e),authorized:false,orders:[],refund:null,participantsOrder:"",participants:[]}); }
    finally { if(n===this._epoch) this.setData({loading:false}); }
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
    if(!id || this.data.busy || this.data.loading || !this.data.authorized || !isSessionCurrent(this._session)) return;
    const n=this._epoch,s=this._session;
    this.setData({busy:true,confirmation:null,selected:id,refund:null,note:"",requestReason:"",canRequestRefund:false,error:"",blocked:true});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const r=await request<Refund>(`/admin/activity-orders/${id}/refund`);
      if(!this.valid(n,s)) return;
      this.showRefund(r); this.setData({blocked:false});
    } catch(e) { if(this.valid(n,s)) this.setData({error:message(e),authorized:!(e instanceof ApiError && [401,403].includes(e.status))}); }
    finally { if(n===this._epoch) this.setData({busy:false}); }
  },
  async toggleParticipants(e:WechatMiniprogram.TouchEvent) {
    const id=safeId(e.currentTarget.dataset.id);
    if(!id || this.data.busy || this.data.loading || this.data.confirmation || !this.data.authorized) return;
    if(!isSessionCurrent(this._session)) {this.setData({authorized:false,orders:[],participantsOrder:"",participants:[],refund:null});return;}
    if(this.data.participantsOrder===id) {this.setData({participantsOrder:"",participants:[]});return;}
    if(!this.data.orders.some(o=>o.id===id)) return;
    const n=this._epoch,s=this._session;
    this.setData({busy:true,participantsOrder:"",participants:[],error:""});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const participants=await request<Participant[]>(`/admin/activity-orders/${id}/participants`);
      if(!this.valid(n,s)) return;
      this.setData({participantsOrder:id,participants});
    } catch(e) {
      if(n===this._epoch && this._alive) {
        const denied=!isSessionCurrent(s) || (e instanceof ApiError && [401,403].includes(e.status));
        this.setData({participantsOrder:"",participants:[],error:message(e),...(denied?{authorized:false,orders:[],refund:null}: {})});
      }
    } finally {
      if(n===this._epoch && this._alive) {
        this.setData({busy:false});
        if(!isSessionCurrent(s)) this.setData({authorized:false,orders:[],participantsOrder:"",participants:[],refund:null});
      }
    }
  },
  cancelConfirmation() { if(!this.data.busy) this.setData({confirmation:null}); },
  async confirmAction() {
    const c=this.data.confirmation;
    if(!c || this.data.busy) return;
    this.setData({confirmation:null});
    if(!this.valid(c.epoch,c.session) || c.session!==this._session) return;
    const event={currentTarget:{dataset:{id:c.id,action:c.action}}} as unknown as WechatMiniprogram.TouchEvent;
    if(c.kind==="request") {
      if(c.id===this.data.selected && c.version===this.data.refund?.version && c.note===this.data.requestReason.trim()) await this.requestRefund(true);
    } else if(c.kind==="order") await this.orderAction(event,true);
    else if(c.id===this.data.selected && c.version===this.data.refund?.version && c.note===this.data.note.trim()) await this.decide(event,true);
  },
  prepareRefundRequest() {return this.requestRefund(false);},
  async requestRefund(confirmed=false) {
    const id=this.data.selected, order=this.data.orders.find(o=>o.id===id), r=this.data.refund;
    if(!order || order.status!=="PAID" || !this.data.canRequestRefund || this.data.busy || this.data.loading || this.data.blocked || !this.data.authorized || !isSessionCurrent(this._session)) return;
    if(r?.status && !["REJECTED","CLOSED"].includes(r.status)) return;
    const reason=this.data.requestReason.trim();
    if(!reason || reason.length>200) {this.setData({error:"请填写 1–200 字退款原因"});return;}
    const n=this._epoch,s=this._session;
    if(!confirmed) {
      if(this.data.confirmation) return;
      this.setData({confirmation:{kind:"request",id,action:"request",epoch:n,session:s,note:reason,version:r?.version,title:"发起全额退款申请？",content:`订单 ${order.orderNo}，全额 ¥${order.amount}。原因：${reason}。提交后进入待审核，仍须批准并由微信确认退款结果。`}});return;
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
      if(!this.valid(n,s)) return;
      const denied=e instanceof ApiError && [401,403].includes(e.status);
      this.setData({blocked:true,canRequestRefund:false,error:"退款申请失败或结果未知，请重新查看退款核对，勿重复提交",...(denied?{authorized:false,orders:[],refund:null,participantsOrder:"",participants:[],requestReason:""}: {})});
    } finally {if(n===this._epoch) this.setData({busy:false});}
  },
  async orderAction(e:WechatMiniprogram.TouchEvent, confirmed=false) {
    const id=safeId(e.currentTarget.dataset.id), action=String(e.currentTarget.dataset.action);
    const order=this.data.orders.find(o=>o.id===id);
    if(!order || !this.data.authorized || this.data.busy || this.data.loading || this.data.blocked || !isSessionCurrent(this._session)) return;
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
      if(this.valid(n,s)) this.setData({blocked:true,error:"操作结果待核对，请刷新订单后再操作",...(e instanceof ApiError && [401,403].includes(e.status)?{authorized:false,orders:[],refund:null,participantsOrder:"",participants:[]}: {})});
    } finally { if(n===this._epoch) this.setData({busy:false}); }
  },
  async decide(e:WechatMiniprogram.TouchEvent, confirmed=false) {
    const action=String(e.currentTarget.dataset.action), r=this.data.refund, id=this.data.selected;
    if(!this.data.authorized||this.data.busy||this.data.loading||this.data.blocked||!r||!id||!isSessionCurrent(this._session)) return;
    if(!["approve","reject","verify","retry"].includes(action)) return;
    if(action==="verify" ? !["PROCESSING","UNKNOWN","ABNORMAL"].includes(r.status||"") : action==="retry" ? !["PROCESSING","UNKNOWN"].includes(r.status||"") : r.status!=="REQUESTED") return;
    if(action!=="verify" && (!Number.isSafeInteger(r.version)||Number(r.version)<0)) return;
    const note=this.data.note.trim();
    if(action==="reject" && (!note || note.length>200)) {this.setData({error:"请填写 1–200 字拒绝原因"});return;}
    const n=this._epoch,s=this._session;
    if (!confirmed) {
      if (this.data.confirmation) return;
      this.setData({confirmation:{kind:"refund",id,action,epoch:n,session:s,note,version:r.version,title:action==="approve"?"确认批准退款？":action==="reject"?"确认拒绝退款？":action==="retry"?"使用原退款单号重试？":"核对退款结果？",content:`订单 ${id}，退款金额 ¥${r.amount}。${action==="reject"?"拒绝原因："+note:"申请原因："+(r.reason||"")}`}}); return;
    }
    this.setData({busy:true,error:""});
    try {
      const checked=await requireAdmin();
      if(!this.valid(n,s)||checked!==s) return;
      const result=await request<Refund>(`/admin/activity-orders/${id}/refund/${action}`,"POST",action==="verify"?{}:{version:r.version,...(action==="reject"?{note}:{})});
      if(!this.valid(n,s)) return;
      this.setData({orders:this.data.orders.map(o=>o.id===id && ["REJECTED","CLOSED","SUCCESS"].includes(result.status||"")?{...o,status:result.status==="SUCCESS"?"REFUNDED":"PAID",statusText:statusLabel(result.status==="SUCCESS"?"REFUNDED":"PAID")}:o)});
      this.showRefund(result); this.setData({note:""});
    } catch(e) {
      if(!this.valid(n,s)) return;
      const denied=e instanceof ApiError && [401,403].includes(e.status);
      this.setData({blocked:true,authorized:!denied,...(denied?{orders:[],refund:null,selected:"",participantsOrder:"",participants:[]}:{}),error:e instanceof ApiError && e.status===409?"退款申请已变化，请重新查看退款后审核":"操作失败或结果未知，请重新查看退款核对，勿重复审核"});
    } finally { if(n===this._epoch) this.setData({busy:false}); }
  },
});
