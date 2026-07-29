import type {
  BostaShipmentSummary,
  CanonicalShipmentState,
  DailyMetrics,
  InstapayRow,
  ShopifyOrderSummary,
} from "./types";

function normalizeOrderNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Best-effort shipment state when no Bosta API lookup is available (or failed)
 * for this order: Shopify alone can't distinguish "delivered" from "in transit"
 * once fulfilled, or a normal return from a failed COD attempt, so this is a
 * coarse approximation, not a substitute for the real Bosta state.
 */
function fallbackStateFromShopify(order: ShopifyOrderSummary): CanonicalShipmentState {
  const tags = order.tags.map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes("return") || t.includes("rto"))) return "returned";
  if (order.financialStatus.toUpperCase() === "REFUNDED") return "returned";
  if (order.fulfillmentStatus.toUpperCase() === "FULFILLED") return "in_transit";
  if (order.fulfillmentStatus.toUpperCase() === "UNFULFILLED") return "pending";
  return "unknown";
}

function resolveShipmentState(
  order: ShopifyOrderSummary,
  bostaByTracking: Map<string, BostaShipmentSummary>,
): CanonicalShipmentState {
  const bosta = order.trackingNumber ? bostaByTracking.get(order.trackingNumber) : undefined;
  return bosta?.state ?? fallbackStateFromShopify(order);
}

export function buildDailyMetrics(
  orders: ShopifyOrderSummary[],
  bostaByTracking: Map<string, BostaShipmentSummary>,
  instapayRows: InstapayRow[],
): DailyMetrics[] {
  const instapayByOrder = new Map<string, InstapayRow[]>();
  for (const row of instapayRows) {
    const key = normalizeOrderNumber(row.orderNumber);
    if (!key) continue;
    const list = instapayByOrder.get(key) ?? [];
    list.push(row);
    instapayByOrder.set(key, list);
  }

  const byDate = new Map<string, ShopifyOrderSummary[]>();
  for (const order of orders) {
    const date = order.createdAt.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(order);
    byDate.set(date, list);
  }

  const days: DailyMetrics[] = [];

  for (const [date, dayOrders] of byDate) {
    const revenue = dayOrders.reduce((sum, o) => sum + o.totalPrice, 0);

    let delivered = 0;
    let inTransit = 0;
    let returned = 0;
    let cancelled = 0;
    let pending = 0;

    let collectedAmount = 0;
    let pendingAmount = 0;
    let failedAmount = 0;
    let totalAmount = 0;

    for (const order of dayOrders) {
      const state = resolveShipmentState(order, bostaByTracking);
      switch (state) {
        case "delivered":
          delivered++;
          break;
        case "returned":
          returned++;
          break;
        case "cancelled":
          cancelled++;
          break;
        case "in_transit":
        case "picked_up":
          inTransit++;
          break;
        default:
          pending++;
      }

      const rows = instapayByOrder.get(normalizeOrderNumber(order.name)) ?? [];
      for (const row of rows) {
        totalAmount += row.amount;
        if (row.status === "collected") collectedAmount += row.amount;
        else if (row.status === "pending") pendingAmount += row.amount;
        else if (row.status === "failed") failedAmount += row.amount;
      }
    }

    const shippingTotal = dayOrders.length;

    days.push({
      date,
      orders: {
        count: dayOrders.length,
        revenue,
        avgOrderValue: dayOrders.length ? revenue / dayOrders.length : 0,
      },
      shipping: {
        total: shippingTotal,
        delivered,
        inTransit,
        returned,
        cancelled,
        pending,
        deliveryRate: shippingTotal ? delivered / shippingTotal : 0,
        returnRate: shippingTotal ? returned / shippingTotal : 0,
      },
      collections: {
        totalAmount,
        collectedAmount,
        pendingAmount,
        failedAmount,
        collectedRate: totalAmount ? collectedAmount / totalAmount : 0,
      },
      returns: {
        count: returned,
        rate: shippingTotal ? returned / shippingTotal : 0,
      },
    });
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}
