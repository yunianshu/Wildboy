import { request } from "./api";

// An unavailable or malformed public capability must never enable this entry.
export async function getAdminLoginCapability(): Promise<boolean> {
  const value = await request<{ adminLoginEnabled: boolean }>("/auth/capabilities");
  if (!value || typeof value.adminLoginEnabled !== "boolean")
    throw new Error("暂时无法核对管理员入口状态，请稍后重试");
  return value.adminLoginEnabled === true;
}
