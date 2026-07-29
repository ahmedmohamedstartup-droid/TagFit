export type CanonicalShipmentState =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "returned"
  | "cancelled"
  | "unknown";

export type CanonicalCollectionState =
  | "collected"
  | "pending"
  | "failed"
  | "cancelled"
  | "unknown";

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  createdAt: string; // ISO date
  financialStatus: string;
  fulfillmentStatus: string;
  totalPrice: number;
  currencyCode: string;
  city: string | null;
  tags: string[];
  trackingCompany: string | null;
  trackingNumber: string | null;
  fulfillmentCreatedAt: string | null;
}

export interface BostaShipmentSummary {
  trackingNumber: string;
  state: CanonicalShipmentState;
  rawState: string;
  codAmount: number | null;
  updatedAt: string | null;
}

export interface InstapayRow {
  orderNumber: string;
  date: string | null;
  name: string;
  phone: string;
  amount: number;
  rawNote: string;
  status: CanonicalCollectionState;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  orders: {
    count: number;
    revenue: number;
    avgOrderValue: number;
  };
  shipping: {
    total: number;
    delivered: number;
    inTransit: number;
    returned: number;
    cancelled: number;
    pending: number;
    deliveryRate: number; // delivered / total
    returnRate: number; // returned / total
  };
  collections: {
    totalAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    failedAmount: number;
    collectedRate: number;
  };
  returns: {
    count: number;
    rate: number; // returns / orders
  };
}

export interface Snapshot {
  generatedAt: string | null; // ISO timestamp of sync run; null if never synced yet
  source: {
    shopifyOrders: number;
    bostaShipments: number;
    instapayRows: number;
  };
  days: DailyMetrics[]; // sorted ascending by date
}
