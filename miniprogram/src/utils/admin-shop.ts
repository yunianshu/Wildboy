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
export function productForm(p: Product): ProductForm {
  return {
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    price: (p.priceCents / 100).toFixed(2),
    stock: String(p.stock),
    status: p.status,
  };
}
export function productInput(f: ProductForm, version?: number) {
  const name = f.name.trim(),
    description = f.description.trim(),
    imageUrl = f.imageUrl.trim();
  if (!name || name.length > 120) throw new Error("商品名称须为 1–120 字");
  if (!description || description.length > 20000)
    throw new Error("商品详情须为 1–20000 字");
  if (imageUrl.length > 2048 || !safeImage(imageUrl))
    throw new Error("请选择内置封面或填写 HTTPS 图片地址");
  if (!/^\d+(\.\d{1,2})?$/.test(f.price))
    throw new Error("价格须为正数，最多两位小数");
  const priceCents = Math.round(Number(f.price) * 100),
    stock = Number(f.stock);
  if (
    !Number.isSafeInteger(priceCents) ||
    priceCents < 1 ||
    priceCents > 100000000
  )
    throw new Error("价格范围 0.01–1000000 元");
  if (!/^\d+$/.test(f.stock) || !Number.isSafeInteger(stock) || stock > 1000000)
    throw new Error("库存须为 0–1000000 的整数");
  if (!["ON_SALE", "OFF_SHELF"].includes(f.status))
    throw new Error("请选择上架状态");
  return {
    name,
    description,
    imageUrl,
    priceCents,
    stock,
    status: f.status,
    ...(version === undefined ? {} : { version }),
  };
}
export const adminOrderStatus = (s: string) =>
  ({
    PENDING_PAYMENT: "待付款",
    PAID: "待发货",
    SHIPPED: "已发货",
    CANCELLED: "已取消",
  })[s] || s;
export const adminMoney = (n: number) => "¥" + (n / 100).toFixed(2);
