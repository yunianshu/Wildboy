import { ApiError, request, hasSession, sessionVersion, isSessionCurrent } from '../../utils/api';
import { message, safeId, dateLabel } from '../../utils/domain';
import { money } from '../../utils/shop';
import { ActivityOrder, ActivityRefund, activityOrderStatus, activityRefundStatus, payActivityOrder, verifyActivityPayment, priceLines } from '../../utils/activity-orders';
type Row=ActivityOrder & {statusText:string;totalText:string;originalText:string;expiresText:string;lines:ReturnType<typeof priceLines>};
Page({
  data:{items:[] as Row[],loggedIn:false,loading:false,loadingMore:false,error:'',page:0,hasMore:false,selectedId:'',busyId:'',confirmId:'',confirmAction:'',refundId:'',refund:null as ActivityRefund|null,refundStatus:'',reason:'',refundError:'',participantsId:'',participants:[] as {id:string;participantName:string;idNumber:string;phone:string}[]},
  _epoch:0,_session:-1,
  onLoad(o:Record<string,string>){this.setData({selectedId:safeId(o.id)});},
  onShow(){void this.load();},
  onHide(){this.clear();},onUnload(){this.clear();},
  clear(){this._epoch++;this.setData({items:[],loading:false,loadingMore:false,busyId:'',confirmId:'',confirmAction:'',refundId:'',refund:null,reason:'',refundError:'',participantsId:'',participants:[]});},
  current(n:number,s:number){return n===this._epoch&&isSessionCurrent(s);},
  row(o:ActivityOrder):Row{return {...o,statusText:activityOrderStatus(o.status),totalText:money(o.totalCents),originalText:money(o.originalTotalCents),expiresText:dateLabel(o.expiresAt),lines:priceLines(o.quote)};},
  async load(more=false){
    if(this.data.busyId || (more && (this.data.loading||this.data.loadingMore||!this.data.hasMore)))return;
    const n=++this._epoch,s=sessionVersion(),page=more?this.data.page+1:0;
    if(this._session!==-1 && this._session!==s)this.setData({selectedId:""});
    this._session=s;
    this.setData({loggedIn:hasSession(),loading:!more,loadingMore:more,error:'',...(more?{}:{items:[],hasMore:false})});
    if(!hasSession()){this.setData({loading:false,loadingMore:false});return;}
    try {
      const result=await request<{items:ActivityOrder[];page:number;hasMore:boolean}>(`/me/activity-orders?page=${page}&size=20`);
      if(!this.current(n,s))return;
      let rows=result.items.map(o=>this.row(o));
      if(!more&&this.data.selectedId&&!rows.some(o=>o.id===this.data.selectedId)){
        try {const selected=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(this.data.selectedId)}`);
          if(!this.current(n,s))return;rows=[this.row(selected),...rows];
        } catch(e) {if(!(e instanceof ApiError && e.status===404))throw e;if(!this.current(n,s))return;this.setData({selectedId:"",error:"该订单不可访问，已显示当前账号订单"});}
      }
      const previous=more?this.data.items:[],ids=new Set(previous.map(o=>o.id));
      this.setData({items:[...previous,...rows.filter(o=>!ids.has(o.id))],page:result.page,hasMore:result.hasMore});
    }catch(e){if(this.current(n,s))this.setData({error:message(e)});}
    finally{if(n===this._epoch)this.setData({loading:false,loadingMore:false});}
  },
  more(){void this.load(true);},retry(){void this.load();},login(){wx.navigateTo({url:'/pages/login/index'});},
  update(o:ActivityOrder){this.setData({items:this.data.items.map(x=>x.id===o.id?this.row(o):x)});},
  async pay(e:WechatMiniprogram.TouchEvent){
    const row=this.data.items.find(o=>o.id===e.currentTarget.dataset.id);if(!row||this.data.busyId||!isSessionCurrent(this._session)||row.status!=='PENDING_PAYMENT'||row.totalCents<=0)return;
    const n=this._epoch,s=this._session;this.setData({busyId:row.id,error:''});
    try{const result=await payActivityOrder(row,()=>this.current(n,s));if(this.current(n,s)){this.update(result);if(result.status==='PENDING_PAYMENT')this.setData({error:'付款尚未确认，请刷新订单核对，不要重复报名。'});}}
    catch(e){if(this.current(n,s))this.setData({error:message(e)});}
    finally{if(n===this._epoch)this.setData({busyId:''});}
  },
  async verify(e:WechatMiniprogram.TouchEvent){
    const id=safeId(e.currentTarget.dataset.id);if(!id||this.data.busyId||!isSessionCurrent(this._session))return;
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:''});
    try{const result=await verifyActivityPayment(id,()=>this.current(n,s));if(this.current(n,s)){this.update(result);if(result.status==='PENDING_PAYMENT')this.setData({error:'暂未确认付款，名额仍按服务端状态保留，请稍后刷新。'});}}
    catch(e){if(this.current(n,s))this.setData({error:message(e)});}
    finally{if(n===this._epoch)this.setData({busyId:''});}
  },
  askCancel(e:WechatMiniprogram.TouchEvent){const row=this.data.items.find(o=>o.id===e.currentTarget.dataset.id);if(!this.data.busyId&&row&&['PENDING_PAYMENT','CONFIRMED_FREE'].includes(row.status))this.setData({confirmId:row.id,confirmAction:'cancel'});},
  dismiss(){if(!this.data.busyId)this.setData({confirmId:'',confirmAction:''});},
  async confirm(){
    const id=this.data.confirmId,action=this.data.confirmAction;if(!id||this.data.busyId||!isSessionCurrent(this._session))return;
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',refundError:'',confirmId:'',confirmAction:''});
    try{
      if(action==='cancel') {const order=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(id)}/cancel`,'POST');if(this.current(n,s))this.update(order);}
      else if(action==='refund'){
        const refund=await request<ActivityRefund>(`/activity-orders/${encodeURIComponent(id)}/refund`,'POST',{reason:this.data.reason.trim()});
        if(!this.current(n,s))return;this.setData({refund,refundStatus:activityRefundStatus(refund.status),reason:''});
        const order=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(id)}`);if(this.current(n,s))this.update(order);
      }
    }catch(e){if(this.current(n,s))this.setData({error:message(e),refundError:action==='refund'?message(e):''});}
    finally{if(n===this._epoch)this.setData({busyId:''});}
  },
  async openRefund(e:WechatMiniprogram.TouchEvent){
    const id=safeId(e.currentTarget.dataset.id);if(!id||this.data.busyId||!isSessionCurrent(this._session))return;
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',refundError:'',refund:null,refundId:'',reason:''});
    try{const refund=await request<ActivityRefund>(`/activity-orders/${encodeURIComponent(id)}/refund`);if(this.current(n,s))this.setData({refundId:id,refund:refund.status?refund:null,refundStatus:activityRefundStatus(refund.status)});}
    catch(e){if(this.current(n,s))this.setData({error:message(e)});}
    finally{if(n===this._epoch)this.setData({busyId:''});}
  },
  reason(e:WechatMiniprogram.Input){if(!this.data.busyId)this.setData({reason:e.detail.value,refundError:''});},
  askRefund(){if(this.data.busyId||!this.data.refundId||(this.data.refund&&!['REJECTED','CLOSED'].includes(this.data.refund.status||'')))return;const reason=this.data.reason.trim();if(!reason||reason.length>200){this.setData({refundError:'请填写 1–200 字的退款原因'});return;}this.setData({confirmId:this.data.refundId,confirmAction:'refund'});},
  closeRefund(){if(!this.data.busyId)this.setData({refundId:'',refund:null,reason:'',refundError:'',confirmId:'',confirmAction:''});},
  async participants(e:WechatMiniprogram.TouchEvent){
    const id=safeId(e.currentTarget.dataset.id);if(!id||this.data.busyId||!isSessionCurrent(this._session))return;
    if(this.data.participantsId===id){this.setData({participantsId:'',participants:[]});return;}
    const n=this._epoch,s=this._session;this.setData({busyId:id,error:'',participantsId:'',participants:[]});
    try{const participants=await request<{id:string;participantName:string;idNumber:string;phone:string}[]>(`/activity-orders/${encodeURIComponent(id)}/participants`);if(this.current(n,s))this.setData({participantsId:id,participants});}
    catch(e){if(this.current(n,s))this.setData({error:message(e)});}
    finally{if(n===this._epoch)this.setData({busyId:''});}
  },
});
