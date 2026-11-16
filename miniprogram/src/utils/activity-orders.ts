import { request, sessionVersion, isSessionCurrent } from './api';
import { PaymentRequest } from './models';
import { money, checkoutRequestId, pendingCheckoutRequestId, finishCheckoutIntent } from './shop';
export interface ActivityPriceLine {unitPriceCents:number; quantity:number; chargedUnitPriceCents:number; tierId:string|null; tierName:string|null; tierVersion:number; pricingMode:string|null; pricingValue:number}
export interface ActivityQuote {participants:number;originalTotalCents:number;totalCents:number;currency:string;participantPricing:string|null;quote:{lines:ActivityPriceLine[];policyVersion:string}}
export interface ActivityOrder {id:string;orderNo:string;activityId:string;activityTitle:string;userId:string;status:string;partySize:number;originalTotalCents:number;totalCents:number;currency:string;quote:ActivityQuote['quote'];paymentTransactionId:string|null;paymentAttempted:boolean;expiresAt:string;version:number}
export interface ActivityRefund {status?:string;amount_cents?:number;reason?:string;decision_note?:string;version?:number;last_error?:string}
export const activityOrderStatus = (s:string) => ({PENDING_PAYMENT:'待支付（名额暂保留）',PAID:'已支付 · 报名已确认',CONFIRMED_FREE:'免支付 · 报名已确认',CLOSED:'已取消',REFUND_PENDING:'退款处理中',REFUNDED:'已退款 · 报名已取消'}[s]||'状态待核对');
export const activityRefundStatus = (s?:string) => ({REQUESTED:'待审核',REJECTED:'已拒绝',PROCESSING:'退款处理中',UNKNOWN:'退款结果待核对',SUCCESS:'退款成功',ABNORMAL:'退款异常待处理',CLOSED:'退款已关闭'}[s||'']||'尚无退款申请');
export function validActivityQuote(q:ActivityQuote,count:number) {return !!q && q.participants===count && q.currency==='CNY' && !!q.quote && Array.isArray(q.quote.lines) && q.quote.lines.length>0 && q.quote.lines.every(x=>[x.quantity,x.unitPriceCents,x.chargedUnitPriceCents].every(Number.isSafeInteger)&&x.quantity>0&&x.unitPriceCents>=0&&x.chargedUnitPriceCents>=0&&x.chargedUnitPriceCents<=x.unitPriceCents) && q.quote.lines.reduce((n,x)=>n+x.quantity,0)===count && q.quote.lines.reduce((n,x)=>n+x.quantity*x.unitPriceCents,0)===q.originalTotalCents && q.quote.lines.reduce((n,x)=>n+x.quantity*x.chargedUnitPriceCents,0)===q.totalCents;}
export function priceLines(q:ActivityQuote['quote']) {return (q?.lines||[]).map((x,i)=>({...x,key:String(i),label:`${x.tierName ? x.tierName+'会员价' : '标准价'} ${money(x.chargedUnitPriceCents)} × ${x.quantity} 人`}));}
export const activityIntent = (user:string,id:string) => checkoutRequestId(user,`activity:${id}`,1);
export const pendingActivityIntent = (user:string,id:string) => pendingCheckoutRequestId(user,`activity:${id}`,1);
export const finishActivityIntent = (user:string,id:string,key:string) => finishCheckoutIntent(user,`activity:${id}`,1,key);
export async function verifyActivityPayment(id:string,current:()=>boolean=()=>true):Promise<ActivityOrder> {
  const s=sessionVersion(); const order=await request<ActivityOrder>(`/activity-orders/${encodeURIComponent(id)}/verify`,'POST');
  if(!current()||!isSessionCurrent(s)) throw new Error('页面或账号已改变，请在活动订单核对');
  if(!order || order.id!==id || !['PENDING_PAYMENT','PAID','CONFIRMED_FREE','CLOSED','REFUND_PENDING','REFUNDED'].includes(order.status)) throw new Error('支付结果未确认，请刷新订单');
  return order;
}
export async function payActivityOrder(order:ActivityOrder,current:()=>boolean=()=>true):Promise<ActivityOrder> {
  if(order.status!=='PENDING_PAYMENT'||order.totalCents<=0) throw new Error('该订单无需支付，请刷新核对');
  const s = sessionVersion();
  const latest = await verifyActivityPayment(order.id, current);
  if (!current() || !isSessionCurrent(s)) throw new Error("页面或账号已改变，请重新确认");
  if (latest.status !== "PENDING_PAYMENT") return latest;
  if (!Number.isSafeInteger(latest.totalCents) || latest.totalCents !== order.totalCents)
    throw new Error("订单金额待核对，请刷新后重新确认");
  const p=await request<PaymentRequest>(`/activity-orders/${encodeURIComponent(order.id)}/pay`,'POST');
  if(!current()||!isSessionCurrent(s)) throw new Error('页面或账号已改变，请重新确认');
  if(!p||!/^\d+$/.test(p.timeStamp)||!p.nonceStr||!/^prepay_id=\S+$/.test(p.package)||p.signType!=='RSA'||!p.paySign) throw new Error('支付参数异常，订单已保留');
  await new Promise<void>((resolve, reject) => {
    wx.requestPayment({
      ...p,
      signType: 'RSA',
      success: () => resolve(),
      fail: (error) => {
        const reason = error.errMsg || '';
        const code = 'errno' in error ? error.errno : undefined;
        if (/cancel/i.test(reason)) {
          reject(new Error('支付已取消，订单和名额暂保留，可继续付款或取消订单'));
        } else if (code === 102 && /jsapi has no permission/i.test(reason)) {
          reject(new Error('微信限制了该小程序的支付权限（102），请联系活动主办方。'));
        } else {
          const detail = typeof code === 'number' && Number.isSafeInteger(code) ? `（微信错误码 ${code}）` : '';
          reject(new Error(`付款结果未知${detail}，请刷新订单核对，不要重复报名`));
        }
      },
    });
  });
  if(!current()||!isSessionCurrent(s)) throw new Error('请在活动订单核对付款结果');
  return verifyActivityPayment(order.id,current);
}
