import { User } from "./models";

export function isActivityUser(user: User | null | undefined): user is User {
  return !!user && (user.role === "USER" ||
    (user.role === "ADMIN" && user.accountSource === "WECHAT" && user.wechatVerified === true));
}

export function profileInputError(realName: string, phone: string): string {
  if (realName.length < 2 || realName.length > 40 || /[\x00-\x1F\x7F]/.test(realName))
    return "姓名须为 2–40 字，且不含控制字符";
  return /^1[3-9]\d{9}$/.test(phone) ? "" : "请填写有效的中国大陆手机号";
}
