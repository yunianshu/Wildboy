import { ShippingAddress } from "./models";
export function validateShippingAddress(
  address: Pick<ShippingAddress, "recipientName" | "phone" | "address">,
): string {
  if (
    address.recipientName.trim().length < 2 ||
    address.recipientName.trim().length > 40
  )
    return "请填写 2–40 字的收货人姓名";
  if (!/^1[3-9]\d{9}$/.test(address.phone.trim()))
    return "请填写有效的中国大陆手机号";
  if (address.address.trim().length < 5 || address.address.trim().length > 300)
    return "请填写完整收货地址";
  return "";
}
