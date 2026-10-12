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

/** Account-level grouping of Bosta's delivery states. */
export type BostaBucket =
  | "created" // pickup requested, not yet picked up
  | "in_transit"
  | "exception" // failed attempt / on hold / awaiting your action
  | "delivered"
  | "returned"
  | "cancelled"
  | "lost" // lost or damaged
  | "unknown";

export interface BostaDelivery {
  trackingNumber: string;
  businessReference: string | null;
  stateCode: number | null;
  stateValue: string;
  bucket: BostaBucket;
  typeCode: number | null;
  typeValue: string | null;
  cod: number;
  fees: number | null;
  city: string | null;
  attempts: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BostaAccountSummary {
  generatedAt: string;
  since: string; // YYYY-MM-DD, start of the lookback window
  total: number;
  byBucket: Record<BostaBucket, number>;
  successRate: number; // delivered / (delivered + returned + lost)
  cod: {
    deliveredAmount: number; // collected by Bosta on delivered shipments
    openAmount: number; // still on shipments in progress
    returnedAmount: number; // on shipments that came back / were lost
  };
  fees: { total: number; perShipment: number } | null; // null when the API doesn't expose pricing
  avgAttemptsToDeliver: number;
  openCount: number;
  stuckCount: number;
  stuckAfterDays: number;
  cities: { city: string; total: number; delivered: number; returned: number; successRate: number }[];
  types: { type: string; count: number }[];
  weekly: { week: string; delivered: number; returned: number }[];
  needsAttention: {
    trackingNumber: string;
    businessReference: string | null;
    state: string;
    bucket: BostaBucket;
    city: string | null;
    cod: number;
    attempts: number;
    ageDays: number;
  }[];
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
  bosta?: BostaAccountSummary | null; // current Bosta account state; absent until a sync with BOSTA_API_KEY
}
