import { ref } from "vue";
import type {
  AdminAccountSettings,
  AdminUser,
  AdminUserRole,
  Auth,
  User,
} from "./types";
// Keep credentials in memory, not localStorage/sessionStorage. Reload requires sign-in.
let token = "";
let sessionVersion = 0;
export const sessionExpired = ref(false);
export const currentUser = ref<User | null>(null);
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function clearSession(expired = false) {
  sessionExpired.value = expired;
  sessionVersion++;
  token = "";
  currentUser.value = null;
}
export function acceptAuth(auth: Auth) {
  if (auth.user.role !== "ADMIN") {
    clearSession();
    throw new ApiError(403, "FORBIDDEN", "此账号没有管理权限");
  }
  sessionVersion++;
  token = auth.token;
  currentUser.value = auth.user;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const startedSession = sessionVersion;
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    credentials: "omit",
  });
  const body =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (startedSession !== sessionVersion)
    throw new ApiError(0, "SESSION_CHANGED", "登录身份已变化，请重新操作。");
  if (!response.ok) {
    if (response.status === 401 && token) clearSession(true);
    const fallback =
      response.status === 409
        ? "记录已被其他人修改或状态发生变化，请重新加载后再操作。"
        : response.status === 403
          ? "当前账号没有执行此操作的权限。"
          : "请求失败，请稍后重试。";
    throw new ApiError(
      response.status,
      body?.code || "REQUEST_FAILED",
      body?.message || fallback,
    );
  }
  return body as T;
}
export async function login(username: string, password: string) {
  const auth = await request<Auth>("/auth/admin", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  acceptAuth(auth);
}
export async function devLogin() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_LOGIN !== "true")
    throw new Error("演示登录未启用");
  acceptAuth(
    await request<Auth>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ role: "ADMIN" }),
    }),
  );
}
export function updateAdminUserRole(
  id: string,
  body: { role: AdminUserRole; version: number },
) {
  return request<AdminUser>(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
export function getAdminAccountSettings() {
  return request<AdminAccountSettings>("/admin/settings/admin-account", {
    cache: "no-store",
  });
}
export function updateAdminAccountSettings(body: {
  username: string;
  currentPassword: string;
  newPassword: string;
  version: number;
}) {
  return request<AdminAccountSettings>("/admin/settings/admin-account", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return "内容冲突：记录可能已在别处更新。请重新加载最新版本，再检查并保存；不会自动覆盖。";
  return error instanceof Error ? error.message : "发生未知错误，请重试。";
}
