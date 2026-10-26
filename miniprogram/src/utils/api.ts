import { config } from "../config";
import { AuthResult } from "./models";
const TOKEN_KEY = "wildboy-session";
let loginPromise: Promise<AuthResult> | undefined;
export function hasSession(): boolean {
  return !!wx.getStorageSync(TOKEN_KEY);
}
export function logout() {
  wx.removeStorageSync(TOKEN_KEY);
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export function mediaUrl(value: string): string {
  return /^\/assets\/(hero-hiking|category-weekly|category-domestic|category-holiday|category-leisure|equipment)\.jpg$/.test(
    value,
  )
    ? value
    : value.startsWith("/")
      ? config.apiOrigin + value
      : /^https:\/\//.test(value)
        ? value
        : "";
}
export function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
): Promise<T> {
  if (config.apiOrigin.includes("example.invalid"))
    return Promise.reject(new Error("服务尚未配置，请联系活动主理人"));
  if (
    !/^https:\/\//.test(config.apiOrigin) &&
    !(
      config.devLogin &&
      wx.getAccountInfoSync().miniProgram.envVersion === "develop"
    )
  )
    return Promise.reject(new Error("正式服务必须使用 HTTPS"));
  const token = wx.getStorageSync(TOKEN_KEY);
  return new Promise((resolve, reject) =>
    wx.request({
      url: config.apiOrigin + "/api/v1" + path,
      method,
      data: data as WechatMiniprogram.IAnyObject,
      timeout: 15000,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        const body = (
          res.data && typeof res.data === "object" ? res.data : {}
        ) as { code?: string; message?: string };
        if (res.statusCode === 401 && token === wx.getStorageSync(TOKEN_KEY))
          logout();
        reject(
          new ApiError(
            typeof body.message === "string"
              ? body.message
              : "请求未完成，请重试",
            res.statusCode,
            typeof body.code === "string" ? body.code : "HTTP_ERROR",
          ),
        );
      },
      fail() {
        reject(new Error("网络连接失败，请检查网络后重试"));
      },
    }),
  );
}
export function login(): Promise<AuthResult> {
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    let result: AuthResult;
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (config.devLogin && env === "develop")
      result = await request<AuthResult>("/auth/dev-login", "POST", {
        role: "USER",
      });
    else {
      const code = await new Promise<string>((resolve, reject) =>
        wx.login({
          success(r) {
            r.code
              ? resolve(r.code)
              : reject(new Error("微信登录失败，请重试"));
          },
          fail() {
            reject(new Error("微信登录取消或失败"));
          },
        }),
      );
      result = await request<AuthResult>("/auth/wechat", "POST", { code });
    }
    if (!result.token) throw new Error("登录响应异常");
    wx.setStorageSync(TOKEN_KEY, result.token);
    return result;
  })().finally(() => {
    loginPromise = undefined;
  });
  return loginPromise;
}
export async function requireSession() {
  if (!hasSession()) await login();
}
