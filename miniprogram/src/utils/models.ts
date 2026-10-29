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
    priceLabel: string;
  }[];
  paymentEnabled: boolean;
}
export interface User {
  id: string;
  nickname: string;
  role: string;
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
  priceCents: number;
  stock: number;
  status: "ON_SALE" | "OFF_SHELF";
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "SHIPPED";
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
