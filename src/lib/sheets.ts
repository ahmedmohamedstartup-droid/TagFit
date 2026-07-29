import { JWT } from "google-auth-library";
import type { CanonicalCollectionState, InstapayRow } from "./types";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const parsed = JSON.parse(raw);
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const private_key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) {
    throw new Error(
      "Missing Google service account credentials: set GOOGLE_SERVICE_ACCOUNT_JSON, or " +
        "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    );
  }
  return { client_email, private_key };
}

async function fetchSheetValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const { client_email, private_key } = getServiceAccountCredentials();
  const client = new JWT({ email: client_email, key: private_key, scopes: [SHEETS_SCOPE] });
  const { token } = await client.getAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Google Sheets API error: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

const FAILED_KEYWORDS = ["cancel", "fail", "faild", "rto", "موصلش", "رجع", "مرتجع", "الغ"];
const PENDING_KEYWORDS = ["pending", "منتظر", "هيحول", "خلال", "لسه", "انتظار"];
const COLLECTED_KEYWORDS = ["collected", "paid", "تم", "استلم", "وصل", "confirmed"];

export function classifyInstapayStatus(rawText: string, amount: number | null): CanonicalCollectionState {
  const text = rawText.toLowerCase();
  if (FAILED_KEYWORDS.some((k) => text.includes(k))) return "failed";
  if (PENDING_KEYWORDS.some((k) => text.includes(k))) return "pending";
  if (COLLECTED_KEYWORDS.some((k) => text.includes(k))) return "collected";
  if (amount !== null && amount > 0) return "collected";
  return "unknown";
}

function findColumnIndex(header: string[], candidates: string[]): number {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) && cleaned !== "" ? value : null;
}

/**
 * Parses the "Refunds/Instapay/C. S." sheet, which is a manually-maintained log
 * rather than a clean table: a fixed set of named columns (order number, date,
 * name, phone, amount) plus free-text status notes scattered across extra
 * columns (mixed Arabic/English: "Cancel", "Faild", "منتظرين رد منها", etc).
 * Any cell outside the recognized columns is folded into `rawNote` and
 * classified by keyword.
 */
export function parseInstapayRows(rows: string[][]): InstapayRow[] {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;

  const orderIdx = findColumnIndex(header, ["order"]);
  const dateIdx = findColumnIndex(header, ["date", "تاريخ"]);
  const nameIdx = findColumnIndex(header, ["name", "اسم"]);
  const phoneIdx = findColumnIndex(header, ["phone", "تليفون", "موبايل"]);
  const amountIdx = findColumnIndex(header, ["amount", "مبلغ"]);

  const knownIdx = new Set([orderIdx, dateIdx, nameIdx, phoneIdx, amountIdx].filter((i) => i >= 0));

  return dataRows
    .filter((row) => row.some((cell) => cell?.trim()))
    .map((row) => {
      const orderNumber = orderIdx >= 0 ? (row[orderIdx] ?? "").trim() : "";
      const date = dateIdx >= 0 ? (row[dateIdx] ?? "").trim() || null : null;
      const name = nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "";
      const phone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() : "";
      const amountRaw = amountIdx >= 0 ? row[amountIdx] : undefined;
      const amount = parseAmount(amountRaw) ?? 0;

      const extraCells = row.filter((_, i) => !knownIdx.has(i));
      const rawNote = [amountRaw, ...extraCells].filter(Boolean).join(" | ");

      return {
        orderNumber,
        date,
        name,
        phone,
        amount,
        rawNote,
        status: classifyInstapayStatus(rawNote, parseAmount(amountRaw)),
      };
    });
}

export async function fetchInstapayRows(spreadsheetId: string, range = "A:Z"): Promise<InstapayRow[]> {
  const rows = await fetchSheetValues(spreadsheetId, range);
  return parseInstapayRows(rows);
}
