export type Category = "WEEKLY" | "DOMESTIC" | "HOLIDAY" | "LEISURE";
export interface Activity {
  id: string;
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
  registeredCount: number;
  confirmedCount?: number;
  pendingPaymentCount?: number;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  priceCents: number;
  currency: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ParticipantInput {
  participantName: string;
  idNumber: string;
  phone: string;
}
export interface Participant extends ParticipantInput {
  id: string;
}
export interface Registration {
  id: string;
  activityId: string;
  activityTitle: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
  participants: Participant[];
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}
export interface Home {
  banners: {
    id: string;
    title: string;
    subtitle: string;
    imageUrl: string;
    activityId: string;
  }[];
  categories: { code: Category; name: string }[];
  equipment: {
    id: string;
    name: string;
    imageUrl: string;
    description: string;
    categoryName: string;
    priceCents: number;
    originalPriceCents: number;
    priceLabel: string;
  }[];
  paymentEnabled: boolean;
}
export type AccountSource = "WECHAT" | "PASSWORD" | "DEMO" | "OTHER";

export interface User {
  id: string;
  nickname: string;
  role: string;
  accountSource?: AccountSource;
  wechatVerified?: boolean;
  realName?: string;
  phone?: string;
  profileCompleted?: boolean;
  version?: number;
}

export interface AdminUser {
  id: string;
  nickname: string;
  realName: string;
  phone: string;
  profileCompleted: boolean;
  createdAt: string;
  profileUpdatedAt: string | null;
  registrationCount: number;
  confirmedRegistrationCount: number;
  pendingRegistrationCount?: number;
  lastRegistrationAt: string | null;
  role: string;
  accountSource: AccountSource;
  wechatVerified: boolean;
  canChangeRole: boolean;
  roleChangeBlockReason: string | null;
  version: number;
}

export type RegistrationStatus = "CONFIRMED" | "CANCELLED";

export interface AdminUserDetail {
  user: AdminUser;
  registrations: PageResult<Omit<Registration, "status"> & {
    status: RegistrationStatus | "PENDING_PAYMENT";
    source?: "FREE_REGISTRATION" | "ACTIVITY_ORDER";
    orderStatus?: "PENDING_PAYMENT" | "PAID" | "CONFIRMED_FREE" | "REFUND_PENDING" | "CLOSED" | "REFUNDED" | null;
  }>;
}
export interface AuthResult {
  token: string;
  user: User;
}
export interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  categoryName: string;
  priceCents: number;
  originalPriceCents: number;
  stock: number;
  status: "ON_SALE" | "OFF_SHELF";
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CONFIRMED_FREE" | "CANCELLED" | "SHIPPED" | "REFUNDED";
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
  expiresAt?: string;
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
export interface PaymentRequest {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

export interface ShippingAddress {
  id: string;
  recipientName: string;
  phone: string;
  address: string;
  isDefault: boolean;
}
