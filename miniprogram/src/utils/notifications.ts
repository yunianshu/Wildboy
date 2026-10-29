import { request, sessionVersion, isSessionCurrent } from "./api";
export async function subscribeNotifications(): Promise<void> {
  const session = sessionVersion();
  const config = await request<{ ready: boolean; templateId: string }>(
    "/notifications/config",
  );
  if (!isSessionCurrent(session)) return;
  if (!config.ready || !config.templateId)
    throw new Error("订阅提醒尚未配置，可在消息页查看通知");
  const result =
    await new Promise<WechatMiniprogram.RequestSubscribeMessageSuccessCallbackResult>(
      (resolve, reject) =>
        wx.requestSubscribeMessage({
          tmplIds: [config.templateId],
          success: resolve,
          fail: reject,
        }),
    );
  if (!isSessionCurrent(session)) return;
  if (result[config.templateId] !== "accept") throw new Error("未开启订阅提醒");
  await request("/me/notifications/subscribe", "POST", { accepted: true });
}
export type WaitlistEntry = {
  id: string;
  activityId: string;
  activityTitle: string;
  status: string;
  partySize: number;
  offerExpiresAt: string | null;
  createdAt: string;
};
export const waitlistStatus: Record<string, string> = {
  WAITING: "排队中",
  OFFERED: "待确认名额",
  CONFIRMED: "已确认报名",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
};
export const notificationStatus: Record<string, string> = {
  PENDING: "待发送",
  SENDING: "发送中",
  SENT: "已发送",
  FAILED: "发送失败",
  NO_PERMISSION: "未订阅",
  UNCONFIGURED: "未配置微信提醒",
  OBSOLETE: "已失效，无需发送",
  UNKNOWN: "发送结果待核对",
};
