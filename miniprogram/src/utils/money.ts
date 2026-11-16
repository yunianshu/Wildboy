/** 金额格式化：分 → ¥x.xx（商城与活动订单共用）。 */
export function money(cents: number): string {
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function checkoutIntentKey(userId: string, productId: string, quantity: number): string {
  return `wildboy-order-intent:${userId}:${productId}:${quantity}`;
}

export function checkoutRequestId(userId: string, productId: string, quantity: number): string {
  const key = checkoutIntentKey(userId, productId, quantity);
  const existing = pendingCheckoutRequestId(userId, productId, quantity);
  if (existing) return existing;
  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r & 3 | 8 : r).toString(16);
  });
  wx.setStorageSync(key, id);
  return id;
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
  const existing = wx.getStorageSync(checkoutIntentKey(userId, productId, quantity));
  return typeof existing === "string" && /^[0-9a-f-]{36}$/.test(existing)
    ? existing
    : undefined;
}
