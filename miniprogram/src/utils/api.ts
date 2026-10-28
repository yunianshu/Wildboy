import { config } from "../config";
import { AuthResult, User } from "./models";
const TOKEN_KEY = "wildboy-session";
let loginPromise: Promise<AuthResult> | undefined;
let sessionEpoch = 0;
let authenticationAttempt = 0;
export function sessionVersion(): number {
  return sessionEpoch;
}
export function isSessionCurrent(version: number): boolean {
  return version === sessionEpoch;
}
export async function getCurrentUser(): Promise<User> {
  const user = await request<User>("/me");
  if (!user || !user.id || !["USER", "ADMIN"].includes(user.role))
    throw new Error("账号信息异常，请重新登录");
  return user;
}
function saveAuthentication(result: AuthResult, attempt: number): AuthResult {
  if (attempt !== authenticationAttempt)
    throw new ApiError("登录状态已改变，请重试", 409, "SESSION_CHANGED");
  if (!result || typeof result.token !== "string" || !result.token)
    throw new Error("登录响应异常");
  sessionEpoch++;
  wx.setStorageSync(TOKEN_KEY, result.token);
  return result;
}
export async function adminLogin(
  username: string,
  password: string,
  isCurrent: () => boolean = () => true,
): Promise<AuthResult> {
  if (
    !username.trim() ||
    username.trim().length > 100 ||
    !password ||
    password.length > 200
  )
    throw new Error("请填写正确的管理员账号和密码");
  const attempt = ++authenticationAttempt;
  const result = await request<AuthResult>("/auth/admin", "POST", {
    username: username.trim(),
    password,
  });
  if (!result?.user?.id || result.user.role !== "ADMIN")
    throw new ApiError("该账号没有管理权限", 403, "FORBIDDEN");
  if (!isCurrent()) throw new ApiError("登录已取消", 409, "LOGIN_CANCELLED");
  return saveAuthentication(result, attempt);
}
export function hasSession(): boolean {
  return !!wx.getStorageSync(TOKEN_KEY);
}
export function logout() {
  sessionEpoch++;
  authenticationAttempt++;
  loginPromise = undefined;
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
function requiresAnyService(): boolean {
  return config.apiMode === "anyservice";
}

export function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  data?: unknown,
): Promise<T> {
  if (requiresAnyService()) {
    // AnyService carries its own TLS tunnel, so only the env and service name
    // are required; a public HTTPS origin is not.
    if (!config.anyServiceEnvId || !config.anyServiceName)
      return Promise.reject(new Error("服务尚未配置，请联系活动主理人"));
  } else {
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
  }
  const token = path.startsWith("/auth/")
    ? undefined
    : wx.getStorageSync(TOKEN_KEY);
  const version = sessionEpoch;
  const header = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return new Promise((resolve, reject) => {
    const done = (statusCode: number, payload: unknown) => {
      if (
        token &&
        (version !== sessionEpoch || token !== wx.getStorageSync(TOKEN_KEY))
      ) {
        reject(new ApiError("账号已切换，请刷新页面", 409, "SESSION_CHANGED"));
        return;
      }
      if (statusCode >= 200 && statusCode < 300) {
        resolve(payload as T);
        return;
      }
      const body = (
        payload && typeof payload === "object" ? payload : {}
      ) as { code?: string; message?: string };
      if (statusCode === 401 && token && token === wx.getStorageSync(TOKEN_KEY))
        logout();
      reject(
        new ApiError(
          typeof body.message === "string" ? body.message : "请求未完成，请重试",
          statusCode,
          typeof body.code === "string" ? body.code : "HTTP_ERROR",
        ),
      );
    };
    const failed = () => reject(new Error("网络连接失败，请检查网络后重试"));
    if (requiresAnyService()) {
      // CloudBase AnyService: fixed service name header plus this project's
      // service identifier. Paths start at the origin root, so keep /api/v1.
      const cloud = wx.cloud;
      if (!cloud || typeof cloud.callContainer !== "function") {
        failed();
        return;
      }
      cloud.callContainer({
        config: { env: config.anyServiceEnvId },
        path: "/api/v1" + path,
        method,
        data: data as WechatMiniprogram.IAnyObject,
        timeout: 15000,
        header: {
          ...header,
          "X-WX-SERVICE": "tcbanyservice",
          "X-AnyService-Name": config.anyServiceName,
        },
        success(res) {
          done(res.statusCode, res.data);
        },
        fail: failed,
      });
      return;
    }
    wx.request({
      url: config.apiOrigin + "/api/v1" + path,
      method,
      data: data as WechatMiniprogram.IAnyObject,
      timeout: 15000,
      header,
      success(res) {
        done(res.statusCode, res.data);
      },
      fail: failed,
    });
  });
}
export function login(
  versions?: { privacyVersion: number; termsVersion: number },
  isCurrent: () => boolean = () => true,
): Promise<AuthResult> {
  if (
    !versions ||
    !Number.isInteger(versions.privacyVersion) ||
    versions.privacyVersion < 1 ||
    !Number.isInteger(versions.termsVersion) ||
    versions.termsVersion < 1
  )
    return Promise.reject(
      new ApiError(
        "请先阅读并同意当前隐私政策和用户协议",
        409,
        "CONSENT_REQUIRED",
      ),
    );
  if (loginPromise) return loginPromise;
  const attempt = ++authenticationAttempt;
  const pending = (async () => {
    let result: AuthResult;
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (config.devLogin && env === "develop")
      result = await request<AuthResult>("/auth/dev-login", "POST", {
        role: "USER",
        ...versions,
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
      result = await request<AuthResult>("/auth/wechat", "POST", {
        code,
        ...versions,
      });
    }
    if (!isCurrent()) throw new ApiError("登录已取消", 409, "LOGIN_CANCELLED");
    const authenticated = saveAuthentication(result, attempt);
    return authenticated;
  })().finally(() => {
    if (loginPromise === pending) loginPromise = undefined;
  });
  loginPromise = pending;
  return pending;
}
export async function requireSession() {
  if (!hasSession()) {
    wx.navigateTo({ url: "/pages/login/index" });
    throw new ApiError("请先完成微信登录，再确认报名", 401, "LOGIN_REQUIRED");
  }
}
