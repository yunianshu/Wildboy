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
  confirmedCount?: number;
  pendingPaymentCount?: number;
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
export type RegistrationStatus = "CONFIRMED" | "CANCELLED" | "PENDING_PAYMENT";
export type ActivityOrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CONFIRMED_FREE"
  | "CLOSED"
  | "REFUND_PENDING"
  | "REFUNDED";
export const activityOrderLabels: Record<ActivityOrderStatus, string> = {
  PENDING_PAYMENT: "待支付（名额保留）",
  PAID: "已支付",
  CONFIRMED_FREE: "免支付已确认",
  CLOSED: "已关闭",
  REFUND_PENDING: "退款处理中（名额保留）",
  REFUNDED: "已退款",
};
export interface Registration {
  id: string;
  activityId: string;
  activityTitle: string;
  status: RegistrationStatus;
  createdAt: string;
  participants: Participant[];
  source?: "FREE_REGISTRATION" | "ACTIVITY_ORDER";
  orderStatus?: ActivityOrderStatus | null;
}
export type ProductStatus = "ON_SALE" | "OFF_SHELF";
export interface ProductInput {
  name: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  priceCents: number;
  originalPriceCents: number;
  stock: number;
  status: ProductStatus;
}
export interface Product extends ProductInput {
  id: string;
  categoryName?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ProductCategory {
  id: string;
  name: string;
  sortOrder: number;
  version: number;
  productCount?: number;
}
export type AdminUserRole = "USER" | "ADMIN";
export type AdminAccountSource = "WECHAT" | "PASSWORD" | "DEMO" | "OTHER";
export interface AdminUser {
  id: string;
  nickname: string;
  realName: string | null;
  phone: string | null;
  profileCompleted: boolean;
  createdAt: string;
  profileUpdatedAt: string | null;
  registrationCount: number;
  confirmedRegistrationCount: number;
  pendingRegistrationCount?: number;
  lastRegistrationAt: string | null;
  role: AdminUserRole;
  accountSource: AdminAccountSource;
  wechatVerified: boolean;
  canChangeRole: boolean;
  roleChangeBlockReason: string | null;
  version: number;
}
export interface AdminUserDetail {
  user: AdminUser;
  registrations: Page<Registration>;
}
export interface AdminAccountSettings {
  configured: boolean;
  username: string;
  version: number;
  canConfigure: boolean;
  configurationBlockReason: string | null;
}
export type NotificationStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "NO_PERMISSION"
  | "UNCONFIGURED"
  | "OBSOLETE"
  | "UNKNOWN";
export interface NotificationNotice {
  id: string;
  status: NotificationStatus;
  kind?: string;
  title: string;
  detail: string;
  lastError: string;
  attempts: number;
}
export interface NotificationConfig {
  ready: boolean;
  templateId: string;
}
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CONFIRMED_FREE"
  | "CANCELLED"
  | "SHIPPED"
  | "REFUNDED";
export interface OrderItem {
  originalPriceCents?: number;
  tierName?: string | null;
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  priceCents: number;
  quantity: number;
}
export interface Order {
  originalTotalCents?: number;
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
  accountSource?: AdminAccountSource;
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
