import { request } from "./api";
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

export async function payOrder(orderId: string): Promise<Order> {
  const payment = await request<PaymentRequest>(`/orders/${orderId}/pay`, "POST");
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
  return request<Order>(`/orders/${orderId}`);
}
