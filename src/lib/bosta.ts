import type {
  BostaAccountSummary,
  BostaBucket,
  BostaDelivery,
  BostaShipmentSummary,
  CanonicalShipmentState,
} from "./types";

const DEFAULT_BASE_URL = "https://app.bosta.co/api/v2";
const PAGE_LIMIT = 50;
const MAX_PAGES = 200; // safety cap: 10k deliveries
const STUCK_AFTER_DAYS = 7;

export function isBostaConfigured(): boolean {
  return Boolean(process.env.BOSTA_API_KEY);
}

/**
 * Bosta's public API docs (docs.bosta.co) block automated fetching, so the field
 * names read in `parseDelivery` and the list endpoints in `fetchDeliveriesPage`
 * come from Bosta's published SDK (npm `bosta`) and its documented state/type
 * codes, not a response captured from this account. If a sync logs
 * "Bosta list returned 0 deliveries" or the numbers look wrong, log one raw
 * page and adjust `parseDelivery` / `extractList`. They are isolated here so
 * this is the only file that needs editing.
 */
async function bostaFetch(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
  const apiKey = process.env.BOSTA_API_KEY;
  const baseUrl = process.env.BOSTA_BASE_URL || DEFAULT_BASE_URL;
  if (!apiKey) throw new Error("Missing BOSTA_API_KEY environment variable");

  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const err = new Error(`Bosta API error: ${res.status} ${(await res.text()).slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

// --- State mapping -----------------------------------------------------------

/** Bosta's numeric delivery state codes → our account-level buckets. */
const STATE_CODE_BUCKET: Record<number, BostaBucket> = {
  10: "created", // Pickup requested
  11: "created", // Waiting for route
  20: "created", // Route assigned
  21: "in_transit", // Picked up from business
  22: "in_transit", // Picking up from consignee
  23: "in_transit", // Picked up from consignee
  24: "in_transit", // Received at warehouse
  25: "in_transit", // Fulfilled
  30: "in_transit", // In transit between hubs
  40: "in_transit", // Picking up / out for delivery
  41: "in_transit", // Picked up / out for delivery
  45: "delivered", // Delivered
  46: "returned", // Returned to business
  47: "exception", // Exception (failed attempt)
  48: "cancelled", // Terminated
  49: "cancelled", // Canceled
  60: "returned", // Returned to stock
  100: "lost", // Lost
  101: "lost", // Damaged
  102: "exception", // Investigation
  103: "exception", // Awaiting your action
  104: "cancelled", // Archived
  105: "exception", // On hold
};

function bucketFromText(value: string): BostaBucket {
  const s = value.toLowerCase();
  if (s.includes("return")) return "returned";
  if (s === "delivered" || s.includes("delivery confirmed")) return "delivered";
  if (s.includes("cancel") || s.includes("terminat") || s.includes("archiv")) return "cancelled";
  if (s.includes("lost") || s.includes("damage")) return "lost";
  if (s.includes("exception") || s.includes("investigation") || s.includes("hold") || s.includes("awaiting"))
    return "exception";
  if (s.includes("pickup requested") || s.includes("waiting for route") || s.includes("route assigned"))
    return "created";
  if (s) return "in_transit";
  return "unknown";
}

export function bucketForState(code: number | null, value: string): BostaBucket {
  if (code !== null && STATE_CODE_BUCKET[code]) return STATE_CODE_BUCKET[code];
  return bucketFromText(value);
}

const BUCKET_TO_CANONICAL: Record<BostaBucket, CanonicalShipmentState> = {
  created: "pending",
  in_transit: "in_transit",
  exception: "in_transit",
  delivered: "delivered",
  returned: "returned",
  cancelled: "cancelled",
  lost: "returned",
  unknown: "unknown",
};

export function normalizeBostaState(rawState: string, code: number | null = null): CanonicalShipmentState {
  return BUCKET_TO_CANONICAL[bucketForState(code, rawState)];
}

// --- Parsing ----------------------------------------------------------------

type Obj = Record<string, unknown>;

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return str(value);
  const o = value as Obj | undefined;
  return str(o?.nameAr) ?? str(o?.name) ?? null;
}

export function parseDelivery(raw: unknown): BostaDelivery | null {
  const d = raw as Obj;
  const trackingNumber = str(d?.trackingNumber) ?? (num(d?.trackingNumber)?.toString() ?? null);
  if (!trackingNumber) return null;

  const state = d.state as Obj | string | undefined;
  const stateCode = typeof state === "object" ? num(state?.code) : null;
  const stateValue =
    (typeof state === "object" ? str(state?.value) : str(state)) ?? str(d.status) ?? "unknown";

  const type = d.type as Obj | string | undefined;
  const typeCode = typeof type === "object" ? num(type?.code) : null;
  const typeValue = (typeof type === "object" ? str(type?.value) : str(type)) ?? null;

  const dropOff = (d.dropOffAddress ?? d.dropOff) as Obj | undefined;
  const pricing = d.pricing as Obj | undefined;
  const attempts = (num(d.attemptsCount) ?? num(d.numberOfAttempts) ?? (Array.isArray(d.attempts) ? d.attempts.length : null)) ?? 0;

  return {
    trackingNumber,
    businessReference: str(d.businessReference),
    stateCode,
    stateValue,
    bucket: bucketForState(stateCode, stateValue),
    typeCode,
    typeValue,
    cod: num(d.cod) ?? 0,
    fees: num(pricing?.priceAfterVat) ?? num(pricing?.priceBeforeVat) ?? num(d.shipmentFees) ?? null,
    city: nameOf(dropOff?.city),
    attempts,
    createdAt: str(d.createdAt),
    updatedAt: str(d.updatedAt),
  };
}

function extractList(payload: unknown): { items: unknown[]; total: number | null } {
  const p = payload as Obj;
  const data = (p?.data ?? p) as Obj | unknown[];
  if (Array.isArray(data)) return { items: data, total: num(p?.count) ?? num(p?.total) };
  for (const key of ["deliveries", "list", "results", "items", "data"]) {
    const v = (data as Obj)?.[key];
    if (Array.isArray(v)) {
      return { items: v, total: num((data as Obj).count) ?? num((data as Obj).total) ?? num(p?.count) };
    }
  }
  return { items: [], total: null };
}

/**
 * v2 exposes `POST /deliveries/search` for paginated listing; older accounts
 * answer `GET /deliveries?pageNumber=&pageLimit=` instead. The first call
 * decides which one this account supports.
 */
let listMode: "search" | "get" | null = null;

async function fetchDeliveriesPage(pageNumber: number): Promise<{ items: unknown[]; total: number | null }> {
  if (listMode !== "get") {
    try {
      const payload = await bostaFetch("/deliveries/search", {
        method: "POST",
        body: { pageNumber, pageLimit: PAGE_LIMIT },
      });
      listMode = "search";
      return extractList(payload);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (listMode === "search" || (status !== 404 && status !== 405)) throw err;
      listMode = "get";
    }
  }
  const payload = await bostaFetch(`/deliveries?pageNumber=${pageNumber}&pageLimit=${PAGE_LIMIT}`);
  return extractList(payload);
}

/**
 * Pages through all of the account's deliveries, then keeps those created since
 * `sinceISO`. List ordering isn't documented, so this doesn't stop early on dates.
 */
export async function fetchBostaDeliveries(sinceISO: string): Promise<BostaDelivery[]> {
  const deliveries: BostaDelivery[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, total } = await fetchDeliveriesPage(page);
    const parsed = items.map(parseDelivery).filter((d): d is BostaDelivery => d !== null);
    deliveries.push(...parsed);

    const reachedEnd = items.length < PAGE_LIMIT || (total !== null && deliveries.length >= total);
    if (reachedEnd) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (deliveries.length === 0) console.warn("Bosta list returned 0 deliveries — check parseDelivery/extractList.");
  return deliveries.filter((d) => (d.createdAt ?? d.updatedAt ?? "9999").slice(0, 10) >= sinceISO);
}

export function toShipmentSummary(d: BostaDelivery): BostaShipmentSummary {
  return {
    trackingNumber: d.trackingNumber,
    state: BUCKET_TO_CANONICAL[d.bucket],
    rawState: d.stateValue,
    codAmount: d.cod,
    updatedAt: d.updatedAt,
  };
}

export async function fetchBostaShipmentByTrackingNumber(
  trackingNumber: string,
): Promise<BostaShipmentSummary | null> {
  try {
    const payload = await bostaFetch(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);
    const data = (payload as Obj)?.data ?? payload;
    const delivery = parseDelivery({ trackingNumber, ...(data as Obj) });
    return delivery ? toShipmentSummary(delivery) : null;
  } catch (err) {
    console.warn(`Bosta lookup failed for ${trackingNumber}:`, (err as Error).message);
    return null;
  }
}

/**
 * Fetches shipment state for a batch of tracking numbers, sequentially with a small
 * delay to stay within typical API rate limits. Skips silently (returns null entries
 * filtered out) for any lookup that fails.
 */
export async function fetchBostaShipments(trackingNumbers: string[]): Promise<BostaShipmentSummary[]> {
  const results: BostaShipmentSummary[] = [];
  for (const trackingNumber of trackingNumbers) {
    const shipment = await fetchBostaShipmentByTrackingNumber(trackingNumber);
    if (shipment) results.push(shipment);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return results;
}

// --- Account summary ----------------------------------------------------------

function daysSince(iso: string | null, now: Date): number {
  if (!iso) return 0;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function weekStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); // weeks start Saturday
  return d.toISOString().slice(0, 10);
}

const OPEN_BUCKETS: BostaBucket[] = ["created", "in_transit", "exception"];

export function buildBostaAccountSummary(
  deliveries: BostaDelivery[],
  sinceISO: string,
  now = new Date(),
): BostaAccountSummary {
  const byBucket: Record<BostaBucket, number> = {
    created: 0,
    in_transit: 0,
    exception: 0,
    delivered: 0,
    returned: 0,
    cancelled: 0,
    lost: 0,
    unknown: 0,
  };
  const cod = { delivered: 0, open: 0, returned: 0 };
  let fees = 0;
  let feesKnown = 0;
  let attemptsOnDelivered = 0;
  const cities = new Map<string, { total: number; delivered: number; returned: number }>();
  const types = new Map<string, number>();
  const weeks = new Map<string, { delivered: number; returned: number }>();

  for (const d of deliveries) {
    byBucket[d.bucket]++;
    if (d.bucket === "delivered") cod.delivered += d.cod;
    else if (OPEN_BUCKETS.includes(d.bucket)) cod.open += d.cod;
    else if (d.bucket === "returned" || d.bucket === "lost") cod.returned += d.cod;

    if (d.fees !== null) {
      fees += d.fees;
      feesKnown++;
    }
    if (d.bucket === "delivered") attemptsOnDelivered += Math.max(d.attempts, 1);

    const city = d.city ?? "غير معروف";
    const c = cities.get(city) ?? { total: 0, delivered: 0, returned: 0 };
    c.total++;
    if (d.bucket === "delivered") c.delivered++;
    if (d.bucket === "returned") c.returned++;
    cities.set(city, c);

    const type = d.typeValue ?? (d.typeCode !== null ? `Type ${d.typeCode}` : "غير معروف");
    types.set(type, (types.get(type) ?? 0) + 1);

    if ((d.bucket === "delivered" || d.bucket === "returned") && (d.updatedAt ?? d.createdAt)) {
      const wk = weekStart((d.updatedAt ?? d.createdAt) as string);
      const w = weeks.get(wk) ?? { delivered: 0, returned: 0 };
      w[d.bucket]++;
      weeks.set(wk, w);
    }
  }

  const completed = byBucket.delivered + byBucket.returned + byBucket.lost;
  const open = deliveries.filter((d) => OPEN_BUCKETS.includes(d.bucket));
  const stuck = open.filter((d) => daysSince(d.createdAt, now) >= STUCK_AFTER_DAYS);

  const needsAttention = [...open]
    .filter((d) => d.bucket === "exception" || daysSince(d.createdAt, now) >= STUCK_AFTER_DAYS)
    .sort((a, b) => daysSince(b.createdAt, now) - daysSince(a.createdAt, now))
    .slice(0, 25)
    .map((d) => ({
      trackingNumber: d.trackingNumber,
      businessReference: d.businessReference,
      state: d.stateValue,
      bucket: d.bucket,
      city: d.city,
      cod: d.cod,
      attempts: d.attempts,
      ageDays: daysSince(d.createdAt, now),
    }));

  return {
    generatedAt: now.toISOString(),
    since: sinceISO,
    total: deliveries.length,
    byBucket,
    successRate: completed ? byBucket.delivered / completed : 0,
    cod: {
      deliveredAmount: cod.delivered,
      openAmount: cod.open,
      returnedAmount: cod.returned,
    },
    fees: feesKnown ? { total: fees, perShipment: fees / feesKnown } : null,
    avgAttemptsToDeliver: byBucket.delivered ? attemptsOnDelivered / byBucket.delivered : 0,
    openCount: open.length,
    stuckCount: stuck.length,
    stuckAfterDays: STUCK_AFTER_DAYS,
    cities: Array.from(cities, ([city, c]) => ({
      city,
      ...c,
      successRate: c.delivered + c.returned ? c.delivered / (c.delivered + c.returned) : 0,
    }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12),
    types: Array.from(types, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    weekly: Array.from(weeks, ([week, w]) => ({ week, ...w })).sort((a, b) => a.week.localeCompare(b.week)),
    needsAttention,
  };
}
