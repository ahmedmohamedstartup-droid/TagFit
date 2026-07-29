import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchShopifyOrders } from "../src/lib/shopify";
import { fetchBostaShipments, isBostaConfigured } from "../src/lib/bosta";
import { fetchInstapayRows } from "../src/lib/sheets";
import { buildDailyMetrics } from "../src/lib/metrics";
import type { BostaShipmentSummary, DailyMetrics, InstapayRow, Snapshot } from "../src/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const LATEST_PATH = path.join(DATA_DIR, "latest.json");

const LOOKBACK_DAYS = Number(process.env.SYNC_LOOKBACK_DAYS ?? 90);
const DEFAULT_SHEET_ID = "1-KdXJ5OTBa5rLKzo2maQZJa_NfWnCf1Uoepuyy1RtDQ";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

async function loadExistingSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await readFile(LATEST_PATH, "utf-8");
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

function mergeDays(previous: DailyMetrics[], fresh: DailyMetrics[]): DailyMetrics[] {
  const byDate = new Map(previous.map((d) => [d.date, d]));
  for (const day of fresh) byDate.set(day.date, day);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  loadLocalEnv();

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceISO = since.toISOString().slice(0, 10);

  console.log(`Fetching Shopify orders since ${sinceISO}...`);
  const orders = await fetchShopifyOrders(sinceISO);
  console.log(`Fetched ${orders.length} orders.`);

  let bostaShipments: BostaShipmentSummary[] = [];
  if (isBostaConfigured()) {
    const trackingNumbers = Array.from(
      new Set(
        orders
          .filter((o) => o.trackingCompany?.toLowerCase().includes("bosta") && o.trackingNumber)
          .map((o) => o.trackingNumber as string),
      ),
    );
    console.log(`Fetching Bosta state for ${trackingNumbers.length} shipments...`);
    bostaShipments = await fetchBostaShipments(trackingNumbers);
  } else {
    console.log("BOSTA_API_KEY not set — falling back to Shopify fulfillment status for shipping state.");
  }
  const bostaByTracking = new Map(bostaShipments.map((s) => [s.trackingNumber, s]));

  let instapayRows: InstapayRow[] = [];
  const sheetId = process.env.GOOGLE_SHEET_ID ?? DEFAULT_SHEET_ID;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.log(`Fetching InstaPay/returns sheet ${sheetId}...`);
    instapayRows = await fetchInstapayRows(sheetId);
    console.log(`Parsed ${instapayRows.length} InstaPay rows.`);
  } else {
    console.log("No Google service account configured — skipping InstaPay/returns sheet.");
  }

  const freshDays = buildDailyMetrics(orders, bostaByTracking, instapayRows);
  const existing = await loadExistingSnapshot();
  const mergedDays = mergeDays(existing?.days ?? [], freshDays);

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      shopifyOrders: orders.length,
      bostaShipments: bostaShipments.length,
      instapayRows: instapayRows.length,
    },
    days: mergedDays,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LATEST_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
  console.log(`Wrote snapshot with ${mergedDays.length} days to ${LATEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
