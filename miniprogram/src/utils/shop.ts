import { request, sessionVersion, isSessionCurrent, ApiError } from "./api";
import { Order, OrderStatus, PaymentRequest } from "./models";
import {
  checkoutRequestId,
  finishCheckoutIntent,
  money,
  pendingCheckoutRequestId,
} from "./money";

// 金额与下单意图辅助函数以 money.ts 为唯一实现，这里 re-export 兼容商城页面既有引用。
export { checkoutRequestId, finishCheckoutIntent, money, pendingCheckoutRequestId };

export function orderStatusLabel(status: OrderStatus): string {
  return (
    {
      PENDING_PAYMENT: "待支付",
      CONFIRMED_FREE: "免支付已确认",
      PAID: "已支付",
      CANCELLED: "已取消",
      SHIPPED: "已发货",
    REFUNDED: "已退款",
    }[status] || "状态待确认"
  );
}

export async function payOrder(
  orderId: string,
  isCurrent: () => boolean = () => true,
): Promise<Order> {
  const session = sessionVersion();
  const current = () => isSessionCurrent(session) && isCurrent();
  const verified = await readPaymentOrder(orderId, current);
  if (verified.status !== "PENDING_PAYMENT") return verified;
  if (verified.reconciliationRequired)
    throw new Error("付款状态仍待核对，请稍后刷新结果或联系管理员");
  let payment: PaymentRequest;
  try {
    payment = await request<PaymentRequest>(`/orders/${orderId}/pay`, "POST");
  } catch (error) {
    if (current() && error instanceof ApiError && error.code === "ORDER_NOT_PAYABLE") {
      const latest = await readPaymentOrder(orderId, current);
      if (latest.status !== "PENDING_PAYMENT") return latest;
    }
    throw error;
  }
  if (!current()) throw new Error("页面或登录状态已改变，请重新确认订单");
  if (!validPayment(payment))
    throw new Error("微信支付参数异常，请稍后重试，订单已保留");
  await new Promise<void>((resolve, reject) =>
    wx.requestPayment({
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType as "RSA",
      paySign: payment.paySign,
      success: () => resolve(),
      fail: (error) => reject(new Error(paymentFailureMessage(error))),
    }),
  );
  if (!isSessionCurrent(session))
    throw new Error("登录状态已改变，请在我的订单中核对付款结果");
  return verifyPayment(orderId, isCurrent);
}

function paymentFailureMessage(error: { errMsg?: string; errCode?: number; errno?: number }): string {
  const detail = error.errMsg || "";
  if (/cancel/i.test(detail))
    return "已取消支付操作，订单已保留，请先核对付款结果";

  const errorCode = [error.errno, error.errCode].find(
    (value) => typeof value === "number" && Number.isSafeInteger(value) && value !== 0,
  );
  const code = errorCode === undefined ? "" : `（微信错误码 ${errorCode}）`;
  let reason = "微信收银台返回异常";
  if (errorCode === 102 || /no permission|access denied|banned|违规|支付功能暂时无法使用/i.test(detail))
    reason = "微信未允许此小程序调起支付，请联系管理员";
  else if (/openid|下单账号与支付账号/i.test(detail))
    reason = "请用下单时的微信账号重新登录";
  else if (/app.?id|pay.?sign|signature|prepay|invalid (?:param|package)|签名|支付场景/i.test(detail))
    reason = "微信未接受本次支付参数，请联系管理员";
  else if (/timeout|network|超时|网络/i.test(detail))
    reason = "连接微信收银台超时或网络异常";
  return `${reason}${code}，订单已保留，请先核对付款结果`;
}

function validPayment(payment: PaymentRequest): boolean {
  return !!payment && typeof payment.timeStamp === "string" && /^\d+$/.test(payment.timeStamp)
    && typeof payment.nonceStr === "string" && !!payment.nonceStr.trim()
    && typeof payment.package === "string" && /^prepay_id=\S+$/.test(payment.package)
    && payment.signType === "RSA" && typeof payment.paySign === "string" && !!payment.paySign.trim();
}

async function readPaymentOrder(orderId: string, current: () => boolean): Promise<Order> {
  if (!current()) throw new Error("页面或登录状态已改变，请在我的订单中核对付款结果");
  const order = await request<Order>(`/orders/${orderId}/verify`, "POST");
  if (!current()) throw new Error("页面或登录状态已改变，请在我的订单中核对付款结果");
  if (!order || order.id !== orderId || !["PENDING_PAYMENT", "PAID", "CONFIRMED_FREE", "SHIPPED", "CANCELLED", "REFUNDED"].includes(order.status))
    throw new Error("订单状态响应异常，请稍后核对付款结果");
  return order;
}

/** Native success is not settlement: only a verified server order can establish payment. */
export async function verifyPayment(
  orderId: string,
  isCurrent: () => boolean = () => true,
): Promise<Order> {
  const session = sessionVersion();
  const current = () => isSessionCurrent(session) && isCurrent();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const order = await readPaymentOrder(orderId, current);
      if (order.status !== "PENDING_PAYMENT" || attempt === 3) return order;
    } catch (error) {
      if (!current()) throw error;
      if (error instanceof ApiError && error.status > 0 && error.status < 500) throw error;
      if (attempt === 3) throw new Error("支付结果暂未确认，订单已保留，请稍后刷新");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("支付结果暂未确认，请稍后刷新");
}

