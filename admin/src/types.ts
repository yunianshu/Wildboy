export type Category = "WEEKLY" | "DOMESTIC" | "HOLIDAY" | "LEISURE";
export type Status = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type NavigationPointKind = "DESTINATION" | "MEETING" | "BOARDING";
export interface NavigationPoint {
  id: string;
  kind: NavigationPointKind;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}
export interface BoardingPointLocation {
  name: string;
  displayName?: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
}
export interface ActivityInput {
  title: string;
  category: Category;
  coverUrl: string;
  galleryUrls: string[];
  summary: string;
  description: string;
  location: string;
  meetingPoint: string;
  boardingPoints?: string[];
  navigationPoints?: NavigationPoint[];
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
  boardingPoint?: string | null;
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
  createdAt?: string;
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
  shippingCompany?: string;
  shippingTrackingNo?: string;
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
  WEEKLY: "户外活动",
  DOMESTIC: "户外旅行",
  HOLIDAY: "重装露营",
  LEISURE: "休闲活动",
};
export const statuses: Record<Status, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CANCELLED: "已取消",
};
export interface HomeQrImage {
  url: string;
  label: string;
}
export type HomeActionType =
  "NONE" | "PAGE" | "ACTIVITY" | "ARTICLE" | "WECHAT_ARTICLE" | "POPUP";
export interface HomeActionLink {
  type: HomeActionType;
  page: string;
  activityId: string;
  articleId: string;
  wechatArticleUrl: string;
  popupTitle: string;
  popupText: string;
  popupImages: HomeQrImage[];
}
export interface HomeHeroConfig {
  imageUrl: string;
  brandName: string;
  brandCaption: string;
  kicker: string;
  title: string;
  subtitle: string;
  action: HomeActionLink;
}
export interface HomeShortcutItem {
  id: string;
  name: string;
  icon: string;
  imageUrl: string;
  type: Exclude<HomeActionType, "NONE">;
  page: string;
  activityId: string;
  articleId: string;
  wechatArticleUrl: string;
  popupTitle: string;
  popupText: string;
  popupImageUrl: string;
  popupImages: HomeQrImage[];
}
export interface HomeShortcutsConfig {
  columns: number;
  items: HomeShortcutItem[];
}
export interface HomeActivitiesConfig {
  eyebrow: string;
  title: string;
  showAllLink: boolean;
  maxCount: number;
  autoFill: boolean;
  featuredActivityIds: string[];
}
export interface HomeShopConfig {
  showBanner: boolean;
  bannerImageUrl: string;
  bannerTag: string;
  bannerTitle: string;
  bannerCta: string;
  showProducts: boolean;
  maxCount: number;
  autoFill: boolean;
  featuredProductIds: string[];
}
export interface HomeGallerySlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  action: HomeActionLink;
}
export interface HomeGalleryConfig {
  eyebrow: string;
  title: string;
  mode: "AUTO_ARTICLES" | "CUSTOM";
  slides: HomeGallerySlide[];
}
export type HomeFooterCell = "BRAND" | "TEXT" | "QR1" | "QR2";
export interface HomeFooterConfig {
  cellOrder?: HomeFooterCell[];
  followEnabled: boolean;
  followTitle: string;
  followSubtitle: string;
  followQrcodes: HomeQrImage[];
  brandEnabled: boolean;
  brandImageUrl: string;
  brandWidthPx: number;
}
export type HomeModuleId =
  "HERO" | "SHORTCUTS" | "ACTIVITIES" | "SHOP" | "GALLERY" | "FOOTER";
export interface HomeModuleEntry {
  id: HomeModuleId;
  enabled: boolean;
}
export interface HomeLayoutConfig {
  version: number;
  modules: HomeModuleEntry[];
  hero: HomeHeroConfig;
  shortcuts: HomeShortcutsConfig;
  activities: HomeActivitiesConfig;
  shop: HomeShopConfig;
  gallery: HomeGalleryConfig;
  footer: HomeFooterConfig;
}
