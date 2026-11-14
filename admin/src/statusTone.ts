// 状态 → 语义色映射，与 docs/redesign/web-admin-color-expansion-2026-11-14.md
// 及 design/设计图文件.pen 画板中的状态胶囊配色一致。
import type { ActivityOrderStatus, RegistrationStatus } from "./types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function activityOrderTone(status: ActivityOrderStatus): Tone {
  if (status === "PAID" || status === "CONFIRMED_FREE") return "success";
  if (status === "REFUNDED") return "info";
  if (status === "CLOSED") return "neutral";
  return "warning"; // PENDING_PAYMENT / REFUND_PENDING：名额保留、待处理
}

export function registrationTone(status: RegistrationStatus): Tone {
  if (status === "CONFIRMED") return "success";
  if (status === "PENDING_PAYMENT") return "warning";
  return "neutral";
}

export function activityStatusTone(status: string): Tone {
  if (status === "PUBLISHED") return "success";
  return "neutral"; // DRAFT / CANCELLED
}

export function articleStatusTone(status: string): Tone {
  return status === "PUBLISHED" ? "success" : "neutral";
}

export function notificationTone(status: string): Tone {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "OBSOLETE") return "neutral";
  if (status === "UNKNOWN") return "info";
  return "warning"; // PENDING / SENDING / NO_PERMISSION / UNCONFIGURED：可恢复
}

export function roleTone(role: string): Tone {
  return role === "ADMIN" ? "info" : "neutral";
}

export function profileTone(completed: boolean): Tone {
  return completed ? "success" : "neutral";
}
