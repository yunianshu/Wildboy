import { request } from "./api";

export type MediaCategory =
  | "ACTIVITY"
  | "SHOP"
  | "ARTICLE"
  | "HOME"
  | "UNCATEGORIZED";

export type MediaCategoryFilter = "ALL" | MediaCategory;

export const mediaCategoryLabels: Record<MediaCategory, string> = {
  ACTIVITY: "活动",
  SHOP: "商城",
  ARTICLE: "文章",
  HOME: "首页",
  UNCATEGORIZED: "未分类",
};

export const mediaCategoryOptions: {
  value: MediaCategory;
  label: string;
}[] = [
  { value: "ACTIVITY", label: "活动" },
  { value: "SHOP", label: "商城" },
  { value: "ARTICLE", label: "文章" },
  { value: "HOME", label: "首页" },
  { value: "UNCATEGORIZED", label: "未分类" },
];

export const mediaFilterTabs: {
  value: MediaCategoryFilter;
  label: string;
}[] = [{ value: "ALL", label: "全部" }, ...mediaCategoryOptions];

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  name: string;
  category: MediaCategory;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaPage {
  items: MediaAsset[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
  counts: Record<string, number>;
}

export interface MediaReference {
  type: string;
  id: string;
  label: string;
}

export interface MediaReferenceCheck {
  referenced: boolean;
  references: MediaReference[];
}

export function listAdminMedia(params: {
  category?: MediaCategoryFilter;
  q?: string;
  page?: number;
  size?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.category && params.category !== "ALL") {
    search.set("category", params.category);
  }
  if (params.q && params.q.trim()) {
    search.set("q", params.q.trim());
  }
  search.set("page", String(params.page ?? 0));
  search.set("size", String(params.size ?? 24));
  return request<MediaPage>(`/admin/media?${search.toString()}`, {
    cache: "no-store",
  });
}

export function updateAdminMedia(
  id: string,
  body: { name?: string; category?: MediaCategory },
) {
  return request<MediaAsset>(`/admin/media/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getAdminMediaReferences(id: string) {
  return request<MediaReferenceCheck>(
    `/admin/media/${encodeURIComponent(id)}/references`,
    { cache: "no-store" },
  );
}

export function deleteAdminMedia(id: string) {
  return request<null>(`/admin/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMediaTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
