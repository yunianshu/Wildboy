import { User } from "./models";
import { mediaUrl } from "./api";
const PROMPT_KEY = "wildboy-display-profile-seen:";
export function displayAvatar(user: User | null): string {
  return user?.avatarUrl ? mediaUrl(user.avatarUrl) : "";
}
export function shouldOfferDisplayProfile(user: User): boolean {
  if (user.accountSource !== "WECHAT" || !user.wechatVerified || user.displayProfileCompleted !== false) return false;
  try { return wx.getStorageSync(PROMPT_KEY + user.id) !== true; } catch { return true; }
}
export function markDisplayProfileSeen(userId: string): void {
  try { wx.setStorageSync(PROMPT_KEY + userId, true); } catch { /* Optional preference must not block login. */ }
}
export function readAvatarBase64(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.stat({ path, success(result) {
      const stat = result.stats as WechatMiniprogram.Stats;
      if (!stat.isFile() || stat.size <= 0 || stat.size > 2 * 1024 * 1024) {
        reject(new Error("请选择不超过 2MB 的 JPG 或 PNG 头像")); return;
      }
      fs.readFile({ filePath: path, encoding: "base64", success(file) {
        if (typeof file.data !== "string" || !file.data || file.data.length > 2796204)
          reject(new Error("头像文件过大，请重新选择"));
        else resolve(file.data);
      }, fail() { reject(new Error("头像读取失败，请重新选择")); } });
    }, fail() { reject(new Error("头像已失效，请重新选择")); } });
  });
}
