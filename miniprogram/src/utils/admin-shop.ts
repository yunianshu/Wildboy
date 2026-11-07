import { Product } from "./models";
import { safeImage } from "../pages/admin-editor/shared";
export const emptyProduct = () => ({
  name: "",
  description: "",
  imageUrl: "/assets/equipment.jpg",
  price: "",
  stock: "0",
  status: "OFF_SHELF",
});
export type ProductForm = ReturnType<typeof emptyProduct>;
/** The editor draft carries the split price and category fields; legacy
 * callers pass a bare ProductForm whose payload stays lean. */
export type ProductDraft = ProductForm & {
  originalPrice: string;
  categoryId: string;
};
/** Legacy rows carry no split price or category; the display must not invent a discount. */
export function productForm(p: Product): ProductDraft {
  const originalCents =
    typeof p.originalPriceCents === "number" && p.originalPriceCents > 0
      ? p.originalPriceCents
      : p.priceCents;
  return {
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    price: (p.priceCents / 100).toFixed(2),
    originalPrice: (originalCents / 100).toFixed(2),
    stock: String(p.stock),
    status: p.status,
    categoryId:
      typeof p.categoryId === "string" && p.categoryId
        ? p.categoryId
        : "uncategorized",
  };
}
function parseCents(text: string, label: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error(`${label}须为正数，最多两位小数`);
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000)
    throw new Error(`${label}范围 0.01–1000000 元`);
  return cents;
}
export function productInput(f: ProductForm | ProductDraft, version?: number) {
  const name = f.name.trim(),
    description = f.description.trim(),
    imageUrl = f.imageUrl.trim();
  if (!name || name.length > 120) throw new Error("商品名称须为 1–120 字");
  if (!description || description.length > 20000)
    throw new Error("商品详情须为 1–20000 字");
  if (imageUrl.length > 2048 || !safeImage(imageUrl))
    throw new Error("请选择内置封面或填写 HTTPS 图片地址");
  const priceCents = parseCents(f.price, "价格");
  const stock = Number(f.stock);
  if (!/^\d+$/.test(f.stock) || !Number.isSafeInteger(stock) || stock > 1000000)
    throw new Error("库存须为 0–1000000 的整数");
  if (!["ON_SALE", "OFF_SHELF"].includes(f.status))
    throw new Error("请选择上架状态");
  // Forms without the split-price/category fields (legacy callers) keep the lean payload;
  // forms that carry them must send exact cents and a real category id.
  const hasOriginal = "originalPrice" in f;
  const hasCategory = "categoryId" in f;
  let originalPriceCents: number | undefined;
  if (hasOriginal) {
    originalPriceCents = parseCents(String(f.originalPrice ?? ""), "原价");
    if (originalPriceCents < priceCents)
      throw new Error("原价不能低于现价");
  }
  let categoryId: string | undefined;
  if (hasCategory) {
    categoryId = String((f as { categoryId?: string }).categoryId ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(categoryId))
      throw new Error("请选择有效的商品分类");
  }
  return {
    name,
    description,
    imageUrl,
    ...(categoryId === undefined ? {} : { categoryId }),
    priceCents,
    ...(originalPriceCents === undefined ? {} : { originalPriceCents }),
    stock,
    status: f.status,
    ...(version === undefined ? {} : { version }),
  };
}
export type CategoryForm = { name: string; sortOrder: string };
export function categoryInput(
  f: CategoryForm,
  version?: number,
): { name: string; sortOrder: number; version?: number } {
  const name = String(f.name ?? "").trim();
  if (!name || name.length > 20) throw new Error("分类名称须为 1–20 字");
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name))
    throw new Error("分类名称不能包含控制字符");
  const raw = String(f.sortOrder ?? "0").trim();
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error("排序须为 0–9999 的整数");
  const sortOrder = Number(raw);
  if (sortOrder > 9999) throw new Error("排序须为 0–9999 的整数");
  return {
    name,
    sortOrder,
    ...(version === undefined ? {} : { version }),
  };
}
export const adminOrderStatus = (s: string) =>
  ({
    PENDING_PAYMENT: "待付款",
    PAID: "待发货",
    SHIPPED: "已发货",
    CANCELLED: "已取消",
    REFUNDED: "已退款",
  })[s] || s;
export const adminMoney = (n: number) => "¥" + (n / 100).toFixed(2);
