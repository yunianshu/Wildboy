import type { ActivityInput } from "./types";
export function toShanghaiInput(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
export function fromShanghaiInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const iso = `${value}:00+08:00`;
  const date = new Date(iso);
  return Number.isFinite(date.valueOf()) && toShanghaiInput(iso) === value
    ? iso
    : "";
}
export function imageUrlValid(value: string) {
  if (/^\/assets\/[A-Za-z0-9_./-]+$/.test(value))
    return !value.split("/").includes("..");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function validateActivity(input: ActivityInput, registered = 0) {
  const errors: Record<string, string> = {};
  if (input.title.trim().length < 2 || input.title.trim().length > 100)
    errors.title = "请输入 2–100 字的活动标题";
  if (!["WEEKLY", "DOMESTIC", "HOLIDAY", "LEISURE"].includes(input.category))
    errors.category = "请选择有效分类";
  if (!input.summary.trim() || input.summary.length > 300)
    errors.summary = "请输入不超过 300 字的活动摘要";
  if (!input.description.trim() || input.description.length > 20000)
    errors.description = "请输入完整活动说明（不超过 20,000 字）";
  if (!input.location.trim() || input.location.length > 200)
    errors.location = "请填写目的地";
  if (!input.meetingPoint.trim() || input.meetingPoint.length > 200)
    errors.meetingPoint = "请填写集合地点";
  if (!imageUrlValid(input.coverUrl))
    errors.coverUrl = "封面须为 HTTPS 图片地址或 /assets/ 路径";
  if (
    input.galleryUrls.length > 8 ||
    input.galleryUrls.some((url) => !imageUrlValid(url))
  )
    errors.galleryUrls = "最多 8 张图片，使用 HTTPS 地址或 /assets/ 路径";
  const start = Date.parse(input.startAt),
    end = Date.parse(input.endAt),
    deadline = Date.parse(input.registrationDeadline);
  if (!Number.isFinite(start)) errors.startAt = "请选择有效开始时间";
  if (!Number.isFinite(end) || end <= start)
    errors.endAt = "结束时间必须晚于开始时间";
  if (!Number.isFinite(deadline) || deadline > start)
    errors.registrationDeadline = "报名截止时间不能晚于开始时间";
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < Math.max(1, registered) ||
    input.capacity > 10000
  )
    errors.capacity = `人数上限须为 ${Math.max(1, registered)}–10,000 的整数，且不能少于已报名人数`;
  if (input.priceCents !== 0)
    errors.priceCents = "微信支付尚未启用，仅支持免费报名";
  return errors;
}
export function displayDate(value: string) {
  if (!Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
