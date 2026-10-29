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
  if (!result || typeof result.token !== "string" || !result.token.trim()
      || typeof result.user?.id !== "string" || !result.user.id.trim()
      || !["USER", "ADMIN"].includes(result.user.role))
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
const uploadedImages = new Map<string, string>();
const uploadedImageRequests = new Map<string, Promise<void>>();
let imageWriteQueue: Promise<void> = Promise.resolve();
const uploadedImagePattern = /^\/assets\/uploads\/[0-9a-f-]{36}\.png$/;
async function cacheUploadedImage(path: string): Promise<void> {
  if (uploadedImages.has(path)) return;
  const pending=uploadedImageRequests.get(path); if(pending)return pending;
  const task=(async()=>{
    const name=path.slice(path.lastIndexOf("/")+1);
    const data=await request<{dataBase64:string}>(`/media/${name}`);
    if(typeof data.dataBase64!=="string"||data.dataBase64.length>5592408||!wx.env?.USER_DATA_PATH)return;
    const directory=`${wx.env.USER_DATA_PATH}/wildboy-public-images`,filePath=`${directory}/${name}`;
    const write=imageWriteQueue.catch(()=>{}).then(async()=>{
      const fs=wx.getFileSystemManager();
      try{fs.mkdirSync(directory,true)}catch(_){}
      const names=fs.readdirSync(directory).filter(n=>/^[0-9a-f-]{36}\.png$/.test(n));
      while(names.length>=64){const old=names.shift()!;if(old===name)continue;const oldPath=`${directory}/${old}`;try{fs.unlinkSync(oldPath);for(const [key,value] of uploadedImages)if(value===oldPath)uploadedImages.delete(key)}catch(_){}}
      await new Promise<void>((resolve,reject)=>fs.writeFile({filePath,data:data.dataBase64,encoding:"base64",success:()=>resolve(),fail:reject}));
      uploadedImages.set(path,filePath);
    });
    imageWriteQueue=write;await write;
  })().finally(()=>uploadedImageRequests.delete(path));
  uploadedImageRequests.set(path,task);return task;
}
async function cacheResponseImages(payload: unknown): Promise<void> {
  const paths=new Set<string>();
  function visit(value:unknown,depth=0){if(depth>8)return;if(typeof value==="string"){if(uploadedImagePattern.test(value))paths.add(value)}else if(Array.isArray(value)){value.forEach(v=>visit(v,depth+1))}else if(value&&typeof value==="object"){Object.values(value).forEach(v=>visit(v,depth+1))}}
  visit(payload);
  const queue=[...paths];
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const path=queue.shift()!;try{await cacheUploadedImage(path)}catch(_){/* Keep API data usable when only an image fails; a later request retries. */}}}));
}
export function mediaUrl(value: string): string {
  if(requiresAnyService() && uploadedImagePattern.test(value))return uploadedImages.get(value)||"/assets/equipment.jpg";
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
        if(requiresAnyService() && !path.startsWith("/media/") && wx.env?.USER_DATA_PATH) {
          void cacheResponseImages(payload).then(()=>{
            if(token && (version!==sessionEpoch || token!==wx.getStorageSync(TOKEN_KEY))) reject(new ApiError("账号已切换，请刷新页面",409,"SESSION_CHANGED"));
            else resolve(payload as T);
          },reject);
        } else resolve(payload as T);
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
      const code = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (code?: string, error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(code!);
        };
        const timer = setTimeout(() => finish(undefined,
          new Error("微信登录超时，请重试")), 10000);
        try {
          wx.login({
            timeout: 10000,
            success(r) {
              typeof r.code === "string" && r.code.trim()
                ? finish(r.code)
                : finish(undefined, new Error("微信登录失败，请重试"));
            },
            fail() { finish(undefined, new Error("微信登录取消或失败")); },
          });
        } catch (_) {
          finish(undefined, new Error("微信登录暂不可用，请重试"));
        }
      });
      if (!isCurrent()) throw new ApiError("登录已取消", 409, "LOGIN_CANCELLED");
      if (attempt !== authenticationAttempt)
        throw new ApiError("登录状态已改变，请重试", 409, "SESSION_CHANGED");
      result = await request<AuthResult>("/auth/wechat", "POST", {
        code,
        ...versions,
      });
    }
    if (!isCurrent()) throw new ApiError("登录已取消", 409, "LOGIN_CANCELLED");
    if (result?.user?.role !== "USER") throw new Error("微信登录响应异常");
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
