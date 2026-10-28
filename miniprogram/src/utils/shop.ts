import { request, sessionVersion, isSessionCurrent } from "./api";
import { Order, OrderStatus, PaymentRequest } from "./models";

export function money(cents: number): string {
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function orderStatusLabel(status: OrderStatus): string {
  return (
    {
      PENDING_PAYMENT: "待支付",
      PAID: "已支付",
      CANCELLED: "已取消",
      SHIPPED: "已发货",
    }[status] || "状态待确认"
  );
}

export async function payOrder(
  orderId: string,
  isCurrent: () => boolean = () => true,
): Promise<Order> {
  const session = sessionVersion();
  const payment = await request<PaymentRequest>(
    `/orders/${orderId}/pay`,
    "POST",
  );
  if (!isSessionCurrent(session) || !isCurrent())
    throw new Error("页面或登录状态已改变，请重新确认订单");
  await new Promise<void>((resolve, reject) =>
    wx.requestPayment({
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType as "RSA",
      paySign: payment.paySign,
      success: () => resolve(),
      fail: () => reject(new Error("支付未完成，订单已保留，可稍后继续支付")),
    }),
  );
  if (!isSessionCurrent(session))
    throw new Error("登录状态已改变，请在我的订单中核对付款结果");
  return request<Order>(`/orders/${orderId}`);
}

/** Persist only an opaque request identity, never shipping details or tokens. */
export function checkoutRequestId(
  userId: string,
  productId: string,
  quantity: number,
): string {
  const key = checkoutIntentKey(userId, productId, quantity);
  const existing = pendingCheckoutRequestId(userId, productId, quantity);
  if (existing) return existing;
  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
  wx.setStorageSync(key, id);
  return id;
}
function checkoutIntentKey(
  userId: string,
  productId: string,
  quantity: number,
): string {
  return `wildboy-order-intent:${userId}:${productId}:${quantity}`;
}
export function finishCheckoutIntent(
  userId: string,
  productId: string,
  quantity: number,
  requestId: string,
) {
  const key = checkoutIntentKey(userId, productId, quantity);
  if (wx.getStorageSync(key) === requestId) wx.removeStorageSync(key);
}

export function pendingCheckoutRequestId(
  userId: string,
  productId: string,
  quantity: number,
): string | undefined {
  const existing = wx.getStorageSync(
    checkoutIntentKey(userId, productId, quantity),
  );
  return typeof existing === "string" && /^[0-9a-f-]{36}$/.test(existing)
    ? existing
    : undefined;
}
