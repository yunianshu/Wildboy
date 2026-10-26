import { Activity, Category } from "./models";
export const categories: {
  code: Category;
  name: string;
  en: string;
  image: string;
}[] = [
  {
    code: "WEEKLY",
    name: "本周活动",
    en: "THIS WEEK",
    image: "/assets/category-weekly.jpg",
  },
  {
    code: "DOMESTIC",
    name: "国内游行",
    en: "GO FURTHER",
    image: "/assets/category-domestic.jpg",
  },
  {
    code: "HOLIDAY",
    name: "假期活动",
    en: "SLOW DAYS",
    image: "/assets/category-holiday.jpg",
  },
  {
    code: "LEISURE",
    name: "休闲活动",
    en: "TAKE IT EASY",
    image: "/assets/category-leisure.jpg",
  },
];
export function categoryName(code: string): string {
  return categories.find((c) => c.code === code)?.name || "户外活动";
}
export function validCategory(code: string): code is Category {
  return categories.some((c) => c.code === code);
}
export function dateLabel(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "时间待确认";
  const n = new Date(d.getTime() + 8 * 3600000);
  return `${n.getUTCMonth() + 1}.${String(n.getUTCDate()).padStart(2, "0")} ${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}`;
}
export function registrationState(
  a: Activity,
  now = Date.now(),
): { enabled: boolean; label: string } {
  if (a.status !== "PUBLISHED")
    return {
      enabled: false,
      label: a.status === "CANCELLED" ? "活动已取消" : "暂未开放",
    };
  if (
    !Number.isFinite(Date.parse(a.registrationDeadline)) ||
    !Number.isFinite(Date.parse(a.startAt)) ||
    Date.parse(a.registrationDeadline) <= now ||
    Date.parse(a.startAt) <= now
  )
    return { enabled: false, label: "报名已截止" };
  if (a.priceCents !== 0) return { enabled: false, label: "付费报名暂未开放" };
  if (a.registeredCount >= a.capacity)
    return { enabled: false, label: "名额已满" };
  return { enabled: true, label: "免费报名" };
}
export function validateParticipant(
  name: string,
  phone: string,
  consent: boolean,
): string {
  if (name.trim().length < 2 || name.trim().length > 40)
    return "请填写 2–40 字的参加人姓名";
  if (!/^1[3-9]\d{9}$/.test(phone.trim())) return "请填写有效的中国大陆手机号";
  if (!consent) return "请先阅读并同意报名信息使用说明";
  return "";
}
export function mergeUnique<T extends { id: string }>(
  old: T[],
  incoming: T[],
): T[] {
  const m = new Map(old.map((x) => [x.id, x]));
  incoming.forEach((x) => m.set(x.id, x));
  return [...m.values()];
}
export function safeId(id: unknown): string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : "";
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "暂时无法连接，请稍后重试";
}
export function activityView(a: Activity) {
  return {
    ...a,
    canCancel:
      a.status === "PUBLISHED" &&
      Date.parse(a.registrationDeadline) > Date.now() &&
      Date.parse(a.startAt) > Date.now(),
    categoryName: categoryName(a.category),
    dateText: dateLabel(a.startAt),
    available: Math.max(0, a.capacity - a.registeredCount),
    ...registrationState(a),
  };
}
export class RequestEpoch {
  private value = 0;
  next() {
    return ++this.value;
  }
  valid(value: number) {
    return this.value === value;
  }
  invalidate() {
    ++this.value;
  }
}
