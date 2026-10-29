export type Category = "WEEKLY" | "DOMESTIC" | "HOLIDAY" | "LEISURE";
export type Status = "DRAFT" | "PUBLISHED" | "CANCELLED";
export interface ActivityInput {
  title: string;
  category: Category;
  coverUrl: string;
  galleryUrls: string[];
  summary: string;
  description: string;
  location: string;
  meetingPoint: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  identityRequired?: boolean;
  capacity: number;
  priceCents: number;
}
export interface Activity extends ActivityInput {
  id: string;
  registeredCount: number;
  status: Status;
  currency: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface Participant {
  id: string;
  participantName: string;
  idNumber: string;
  phone: string;
}
export interface Registration {
  id: string;
  activityId: string;
  activityTitle: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
  participants: Participant[];
}
export type ProductStatus = "ON_SALE" | "OFF_SHELF";
export interface ProductInput {
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  stock: number;
  status: ProductStatus;
}
export interface Product extends ProductInput {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type OrderStatus =
  "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "SHIPPED" | "REFUNDED";
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  priceCents: number;
  quantity: number;
}
export interface Order {
  reconciliationRequired?: boolean;
  id: string;
  orderNo: string;
  userId: string;
  totalCents: number;
  status: OrderStatus;
  recipientName: string;
  phone: string;
  address: string;
  paymentTransactionId: string | null;
  paymentInitiated: boolean;
  paidAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}
export interface User {
  id: string;
  nickname: string;
  role: string;
}
export interface Auth {
  token: string;
  user: User;
}
export const categories: Record<Category, string> = {
  WEEKLY: "本周活动",
  DOMESTIC: "国内游行",
  HOLIDAY: "假期活动",
  LEISURE: "休闲活动",
};
export const statuses: Record<Status, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CANCELLED: "已取消",
};
