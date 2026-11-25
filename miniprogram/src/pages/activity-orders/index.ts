import { enterPage } from "../../utils/page-motion";
import { ApiError, request, hasSession, sessionVersion, isSessionCurrent, isAccessDenied } from '../../utils/api';
import { message, safeId, dateLabel } from '../../utils/domain';
import { money } from '../../utils/shop';
import { ActivityOrder, ActivityRefund, activityOrderStatus, activityRefundStatus, payActivityOrder, verifyActivityPayment, priceLines } from '../../utils/activity-orders';
type Row=ActivityOrder & {statusText:string;totalText:string;originalText:string;expiresText:string;lines:ReturnType<typeof priceLines>};
Page({
  data: { pageMotionClass: "",items:[] as Row[],loggedIn:false,status:'',loading:false,loadingMore:false,error:'',paymentNotice:null as {orderId:string;text:string}|null,page:0,hasMore:false,selectedId:'',activityId:'',busyId:'',confirmId:'',confirmAction:'',refundId:'',refund:null as ActivityRefund|null,refundStatus:'',reason:'',refundError:'',participantsId:'',participants:[] as {id:string;participantName:string;idNumber:string;phone:string}[]},
  _epoch:0,_session:-1,
  onLoad(o:Record<string,string>){this.setData({selectedId:safeId(o.id),activityId:safeId(o.activityId)});},
  async onShow() {
    enterPage(this);
    const session = sessionVersion();
    const pending = this.load();
    const attempt = this._epoch;
    await pending;
    if (this.current(attempt, session)) await this.reconcilePending();
  },
  onHide(){this.clear();},onUnload(){this.clear();},
  clear(){this._epoch++;this.setData({items:[],loggedIn:false,loading:false,loadingMore:false,busyId:'',paymentNotice:null,page:0,hasMore:false,confirmId:'',confirmAction:'',refundId:'',refund:null,refundStatus:'',reason:'',refundError:'',participantsId:'',participants:[]});},
  current(n:number,s:number){return n===this._epoch&&isSessionCurrent(s);},
  checkAccess(n: number, session: number, error?: unknown): boolean {
    if (n !== this._epoch) return false;
    if (isSessionCurrent(session) && !isAccessDenied(error)) return true;
    this.clear();
    this.setData({ selectedId: "", error: error ? message(error) : "登录状态已改变，请重新登录" });
    return false;
  },
  canAct(): boolean {
    return this.data.loggedIn && this.checkAccess(this._epoch, this._session) &&
      !this.data.busyId && !this.data.loading && !this.data.loadingMore;
  },
  row(o:ActivityOrder):Row{return {...o,statusText:activityOrderStatus(o.status),totalText:money(o.totalCents),originalText:money(o.originalTotalCents),expiresText:dateLabel(o.expiresAt),lines:priceLines(o.quote)};},
  async load(more=false){
    if(this.data.busyId || (more && (this.data.loading||this.data.loadingMore||!this.data.hasMore)))return;
    const s=sessionVersion();
    if(this._session!==-1 && this._session!==s) {
      this.setData({selectedId:""});
      more = false;
    }
    if (!more) this.clear();
    const n=++this._epoch,page=more?this.data.page+1:0;
    this._session=s;
    this.setData({loggedIn:hasSession(),loading:!more,loadingMore:more,error:'',...(more?{}:{items:[],hasMore:false})});
    if(!hasSession()){this.setData({loading:false,loadingMore:false});return;}
    try {
      const filter = this.data.activityId ? `&activityId=${this.data.activityId}` : '';
      const status = this.data.status ? '&status=' + encodeURIComponent(this.data.status) : '';
      const result=await request<{items:ActivityOrder[];page:number;hasMore:boolean}>(`/me/activity-orders?page=${page}&size=20${filter}${status}`);
      if(!this.current(n,s))return;
      let rows=result.items.map(o=>this.row(o));
      if(!more&&this.data.selectedId&&!rows.some(o=>o.id===this.data.selectedId)){
        try {const selected=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(this.data.selectedId)}`);
          if(!this.current(n,s))return;rows=[this.row(selected),...rows];
        } catch(e) {if(!(e instanceof ApiError && e.status===404))throw e;if(!this.current(n,s))return;this.setData({selectedId:"",error:"该订单不可访问，已显示当前账号订单"});}
      }
      const previous=more?this.data.items:[],ids=new Set(previous.map(o=>o.id));
      this.setData({items:[...previous,...rows.filter(o=>!ids.has(o.id))],page:result.page,hasMore:result.hasMore});
    }catch(e){if(this.checkAccess(n,s,e))this.setData({error:message(e)});}
    finally{if(this.checkAccess(n,s))this.setData({loading:false,loadingMore:false});}
  },
  filterStatus(event: WechatMiniprogram.TouchEvent) {
    const status = String(event.currentTarget.dataset.status || "");
    if (!["", "PENDING_PAYMENT", "PAID", "REFUND_PENDING"].includes(status) || this.data.busyId) return;
    this.setData({ status, selectedId: "" });
    void this.load();
  },
  onPullDownRefresh() {
    return this.load().finally(() => wx.stopPullDownRefresh());
  },
  onReachBottom() {
    this.more();
  },
  openActivity(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/detail/index?id=" + id });
  },
  copyOrderNumber(event: WechatMiniprogram.TouchEvent) {
    const row = this.data.items.find((item) => item.id === event.currentTarget.dataset.id);
    if (row?.orderNo && this.canAct()) wx.setClipboardData({ data: row.orderNo });
  },
  more(){void this.load(true);},retry(){void this.load();},login(){wx.navigateTo({url:'/pages/login/index'});},
  update(o:ActivityOrder){this.setData({items:this.data.items.map(x=>x.id===o.id?this.row(o):x)});},
  async pay(e:WechatMiniprogram.TouchEvent){
    const row=this.data.items.find(o=>o.id===e.currentTarget.dataset.id);if(!this.canAct()||!row||row.status!=='PENDING_PAYMENT'||row.totalCents<=0)return;
    const n=this._epoch,s=this._session;this.setData({busyId:row.id,error:'',paymentNotice:null});
    try {
      const result = await payActivityOrder(row, () => this.current(n,s));
      if (!this.current(n,s)) return;
      this.update(result);
      if (result.status === 'PENDING_PAYMENT') {
        this.setData({paymentNotice:{orderId:row.id,text:'系统正在核对付款结果，请勿重复报名。'}});
      } else if (result.status === "PAID") {
        wx.showToast?.({ title: "付款已确认", icon: "success" });
      }
    } catch (e) {
      if (this.checkAccess(n,s,e)) this.setData({paymentNotice:{orderId:row.id,text:message(e)}});
    }
    finally{if(this.checkAccess(n,s))this.setData({busyId:''});}
  },
  async reconcilePending(){
    if (!this.canAct()) return;
    const id = this.data.items.find(row => row.status === "PENDING_PAYMENT" && row.paymentAttempted)?.id;
    if (!id) return;
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',paymentNotice:null});
    try{const result=await verifyActivityPayment(id,()=>this.current(n,s));if(this.current(n,s)){this.update(result);if(result.status==='PENDING_PAYMENT')this.setData({error:'付款尚未确认，名额仍按服务端状态保留。'});}}
    catch(e){if(this.checkAccess(n,s,e))this.setData({error:message(e)});}
    finally{if(this.checkAccess(n,s))this.setData({busyId:''});}
  },
  askCancel(e:WechatMiniprogram.TouchEvent){const row=this.data.items.find(o=>o.id===e.currentTarget.dataset.id);if(this.canAct()&&row&&['PENDING_PAYMENT','CONFIRMED_FREE'].includes(row.status))this.setData({confirmId:row.id,confirmAction:'cancel'});},
  dismiss(){if(!this.data.busyId)this.setData({confirmId:'',confirmAction:''});},
  async confirm(){
    const id=this.data.confirmId,action=this.data.confirmAction;
    if(!id||!this.canAct())return;
    const row = this.data.items.find(item => item.id === id);
    if (!row || (action === "cancel" && !["PENDING_PAYMENT", "CONFIRMED_FREE"].includes(row.status))
        || (action === "refund" && (row.status !== "PAID" || this.data.refundId !== id))) {
      this.dismiss();
      return;
    }
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',refundError:'',confirmId:'',confirmAction:''});
    try{
      if(action==='cancel') {const order=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(id)}/cancel`,'POST');if (this.current(n,s)) {
        this.update(order);
        wx.showToast?.({ title: "已取消报名", icon: "success" });
      }}
      else if(action==='refund'){
        const refund=await request<ActivityRefund>(`/activity-orders/${encodeURIComponent(id)}/refund`,'POST',{reason:this.data.reason.trim()});
        if(!this.current(n,s))return;this.setData({refund,refundStatus:activityRefundStatus(refund.status),reason:''});
        wx.showToast?.({ title: '退款申请已提交', icon: 'success' });
        const order=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(id)}`);if(this.current(n,s))this.update(order);
      }
    }catch(e){if(this.checkAccess(n,s,e))this.setData({error:message(e),refundError:action==='refund'?message(e):''});}
    finally{if(this.checkAccess(n,s))this.setData({busyId:''});}
  },
  async openRefund(e:WechatMiniprogram.TouchEvent){
    const id=safeId(e.currentTarget.dataset.id);if(!this.canAct()||!this.data.items.some(row=>row.id===id))return;
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',refundError:'',refund:null,refundId:'',reason:''});
    try{const refund=await request<ActivityRefund>(`/activity-orders/${encodeURIComponent(id)}/refund`);if(this.current(n,s))this.setData({refundId:id,refund:refund.status?refund:null,refundStatus:activityRefundStatus(refund.status)});}
    catch(e){if(this.checkAccess(n,s,e))this.setData({error:message(e)});}
    finally{if(this.checkAccess(n,s))this.setData({busyId:''});}
  },
  reason(e:WechatMiniprogram.Input){if(!this.data.busyId&&!this.data.confirmId)this.setData({reason:e.detail.value,refundError:''});},
  askRefund(){if(!this.canAct()||!this.data.items.some(row=>row.id===this.data.refundId&&row.status==='PAID')||(this.data.refund&&!['REJECTED','CLOSED'].includes(this.data.refund.status||'')))return;const reason=this.data.reason.trim();if(!reason||reason.length>200){this.setData({refundError:'请填写 1–200 字的退款原因'});return;}this.setData({confirmId:this.data.refundId,confirmAction:'refund'});},
  closeRefund(){if(!this.data.busyId)this.setData({refundId:'',refund:null,reason:'',refundError:'',confirmId:'',confirmAction:''});},
  async participants(e:WechatMiniprogram.TouchEvent){
    const id=safeId(e.currentTarget.dataset.id);if(!this.canAct()||!this.data.items.some(row=>row.id===id))return;
    if(this.data.participantsId===id){this.setData({participantsId:'',participants:[]});return;}
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',participantsId:'',participants:[]});
    try{const participants=await request<{id:string;participantName:string;idNumber:string;phone:string}[]>(`/activity-orders/${encodeURIComponent(id)}/participants`);if(this.current(n,s))this.setData({participantsId:id,participants});}
    catch(e){if(this.checkAccess(n,s,e))this.setData({error:message(e)});}
    finally{if(this.checkAccess(n,s))this.setData({busyId:''});}
  },
});
