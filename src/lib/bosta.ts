import type { BostaShipmentSummary, CanonicalShipmentState } from "./types";

const DEFAULT_BASE_URL = "https://app.bosta.co/api/v2";

export function isBostaConfigured(): boolean {
  return Boolean(process.env.BOSTA_API_KEY);
}

/**
 * Bosta's public API docs (docs.bosta.co) block automated fetching, so the exact
 * response field names below are a best-effort guess from their published SDKs
 * (bostaapp/bosta-nodejs) and third-party tracking integrations, not a verified
 * response schema. Once a real BOSTA_API_KEY is available, call
 * fetchBostaShipmentByTrackingNumber() for one known tracking number, log the raw
 * response, and adjust `extractRawState` / `normalizeBostaState` below to match —
 * both are isolated here on purpose so that's the only edit needed.
 */
async function bostaFetch(path: string): Promise<unknown> {
  const apiKey = process.env.BOSTA_API_KEY;
  const baseUrl = process.env.BOSTA_BASE_URL ?? DEFAULT_BASE_URL;
  if (!apiKey) throw new Error("Missing BOSTA_API_KEY environment variable");

  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Bosta API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function extractRawState(payload: unknown): { rawState: string; codAmount: number | null; updatedAt: string | null } {
  const data = (payload as { data?: Record<string, unknown> })?.data ?? (payload as Record<string, unknown>);
  const rawState =
    (data?.state as { value?: string } | undefined)?.value ??
    (data?.status as string | undefined) ??
    "unknown";
  const codAmount = (data?.cod as number | undefined) ?? null;
  const updatedAt = (data?.updatedAt as string | undefined) ?? null;
  return { rawState: String(rawState), codAmount, updatedAt };
}

export function normalizeBostaState(rawState: string): CanonicalShipmentState {
  const s = rawState.toLowerCase();
  if (s.includes("deliver") && !s.includes("fail") && !s.includes("un")) return "delivered";
  if (s.includes("return") || s.includes("rto")) return "returned";
  if (s.includes("cancel") || s.includes("terminat")) return "cancelled";
  if (s.includes("transit") || s.includes("out for") || s.includes("van") || s.includes("hub")) return "in_transit";
  if (s.includes("pick")) return "picked_up";
  if (s.includes("pending") || s.includes("created") || s.includes("new")) return "pending";
  return "unknown";
}

export async function fetchBostaShipmentByTrackingNumber(
  trackingNumber: string,
): Promise<BostaShipmentSummary | null> {
  try {
    const payload = await bostaFetch(`/deliveries/business/${encodeURIComponent(trackingNumber)}`);
    const { rawState, codAmount, updatedAt } = extractRawState(payload);
    return {
      trackingNumber,
      state: normalizeBostaState(rawState),
      rawState,
      codAmount,
      updatedAt,
    };
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
