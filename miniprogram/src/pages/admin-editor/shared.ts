import {
  ApiError,
  getCurrentUser,
  hasSession,
  sessionVersion,
  isSessionCurrent,
} from "../../utils/api";
import { Activity, Category } from "../../utils/models";
import { categories } from "../../utils/domain";

export async function requireAdmin(): Promise<number> {
  if (!hasSession())
    throw new ApiError("请先验证管理员身份", 401, "ADMIN_LOGIN_REQUIRED");
  const version = sessionVersion();
  const user = await getCurrentUser();
  if (!isSessionCurrent(version)) throw new Error("登录身份已改变，请重试");
  if (user.role !== "ADMIN")
    throw new ApiError("当前账号没有管理权限", 403, "FORBIDDEN");
  return version;
}
export const statusLabel = (status: string) =>
  ({ DRAFT: "草稿", PUBLISHED: "已发布", CANCELLED: "已取消" })[status] ||
  status;
export const presets = [
  "hero-hiking",
  "category-weekly",
  "category-domestic",
  "category-holiday",
  "category-leisure",
  "equipment",
].map((name) => `/assets/${name}.jpg`);
export type EditForm = {
  identityRequired: boolean;
  title: string;
  category: Category;
  coverUrl: string;
  galleryText: string;
  summary: string;
  description: string;
  location: string;
  meetingPoint: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  deadlineDate: string;
  deadlineTime: string;
  capacity: string;
};
export function emptyForm(): EditForm {
  return {
    identityRequired: false,
    title: "",
    category: "WEEKLY",
    coverUrl: presets[1],
    galleryText: "",
    summary: "",
    description: "",
    location: "",
    meetingPoint: "",
    startDate: "",
    startTime: "06:30",
    endDate: "",
    endTime: "12:00",
    deadlineDate: "",
    deadlineTime: "18:00",
    capacity: "20",
  };
}
export function chinaFields(value: string) {
  const d = new Date(Date.parse(value) + 8 * 3600000);
  if (!Number.isFinite(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 16),
  };
}
export function formFromActivity(a: Activity): EditForm {
  const s = chinaFields(a.startAt),
    e = chinaFields(a.endAt),
    d = chinaFields(a.registrationDeadline);
  return {
    identityRequired: !!a.identityRequired,
    title: a.title,
    category: a.category,
    coverUrl: a.coverUrl,
    galleryText: a.galleryUrls.join("\n"),
    summary: a.summary,
    description: a.description,
    location: a.location,
    meetingPoint: a.meetingPoint,
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    deadlineDate: d.date,
    deadlineTime: d.time,
    capacity: String(a.capacity),
  };
}
export function chinaIso(date: string, time: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("请填写完整日期与时间");
  const value = `${date}T${time}:00+08:00`;
  const n = Date.parse(value);
  if (!Number.isFinite(n) || chinaFields(value).date !== date)
    throw new Error("日期无效，请重新选择");
  return value;
}
export function safeImage(value: string): boolean {
  return (
    (/^\/assets\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes("..")) ||
    /^https:\/\/[^\s]+$/.test(value)
  );
}
export function buildInput(f: EditForm, registered = 0, now = Date.now()) {
  const title = f.title.trim(),
    summary = f.summary.trim(),
    description = f.description.trim(),
    location = f.location.trim(),
    meetingPoint = f.meetingPoint.trim();
  if (!title || title.length > 120) throw new Error("活动名称须为 1–120 字");
  if (!categories.some((x) => x.code === f.category))
    throw new Error("请选择有效活动分类");
  if (!safeImage(f.coverUrl.trim()))
    throw new Error("请选择内置封面或填写 HTTPS 图片地址");
  if (!summary || summary.length > 300)
    throw new Error("活动简介须为 1–300 字");
  if (!description || description.length > 20000)
    throw new Error("活动详情须为 1–20000 字");
  if (
    !location ||
    location.length > 200 ||
    !meetingPoint ||
    meetingPoint.length > 200
  )
    throw new Error("活动地点与集合地点须填写，且各不超过 200 字");
  const capacity = Number(f.capacity);
  if (
    !/^\d+$/.test(f.capacity) ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    capacity > 10000 ||
    capacity < registered
  )
    throw new Error(`名额须为 ${Math.max(1, registered)}–10000 的整数`);
  const startAt = chinaIso(f.startDate, f.startTime),
    endAt = chinaIso(f.endDate, f.endTime),
    registrationDeadline = chinaIso(f.deadlineDate, f.deadlineTime);
  if (Date.parse(startAt) <= now) throw new Error("活动开始时间必须在未来");
  if (Date.parse(endAt) <= Date.parse(startAt))
    throw new Error("结束时间必须晚于开始时间");
  if (Date.parse(registrationDeadline) > Date.parse(startAt))
    throw new Error("报名截止不能晚于开始时间");
  const galleryUrls = f.galleryText
    .split(/\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (galleryUrls.length > 12 || galleryUrls.some((x) => !safeImage(x)))
    throw new Error("详情图片最多 12 张，请使用 HTTPS 地址或内置资源");
  return {
    title,
    identityRequired: f.identityRequired,
    category: f.category,
    coverUrl: f.coverUrl.trim(),
    galleryUrls,
    summary,
    description,
    location,
    meetingPoint,
    startAt,
    endAt,
    registrationDeadline,
    capacity,
    priceCents: 0,
  };
}
export function maskPhone(phone: string): string {
  if (phone.length < 7) return "••••";
  return phone.slice(0, 3) + " **** " + phone.slice(-4);
}
