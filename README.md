# TagFit Brand Dashboard

A brand-health dashboard for TagFit (tagfit.store) that combines **Shopify**
orders, **Bosta** shipping/tracking status, and the manually-maintained
**InstaPay collections / returns** Google Sheet into daily metrics: revenue,
orders, delivery rate, return rate, and collections status.

The dashboard is a static site rebuilt automatically every 4 hours by a
GitHub Actions workflow, so it stays current without needing a persistent
server.

## ملخص بالعربي

الداشبورد بيجمع بيانات شوبيفاي (الأوردرات)، بوسطة (حالة الشحن)، وشيت
الإنستاباي/المرتجعات، ويحسب منها مؤشرات يومية: الإيرادات، عدد الأوردرات،
نسبة التسليم، نسبة المرتجعات، ونسبة التحصيل. في كل مرة يشتغل فيها الـ GitHub
Action (كل 4 ساعات تلقائيًا، أو يدويًا من تبويب Actions)، بيسحب أحدث بيانات،
يحسب المؤشرات، ويعيد نشر الموقع.

**عشان يشتغل محتاج تضيف الأسرار دي في إعدادات الريبو (Settings → Secrets and
variables → Actions):**

- `SHOPIFY_SHOP`, `SHOPIFY_ADMIN_ACCESS_TOKEN` — لازم للاتصال بشوبيفاي.
- `BOSTA_API_KEY` (و`BOSTA_BASE_URL` لو مختلف) — لو مش موجود، هيستخدم بيانات
  الشحن الموجودة أصلاً جوه شوبيفاي (شركة الشحن ورقم التتبع) كتقريب.
- `GOOGLE_SERVICE_ACCOUNT_JSON` و `GOOGLE_SHEET_ID` — لقراءة شيت
  الإنستاباي/المرتجعات. لازم تشير الشيت مع الـ `client_email` بتاع الـ service
  account كـ Viewer.

وفعّل GitHub Pages من Settings → Pages → Source: GitHub Actions.

---

## Architecture

```
Shopify Admin API ─┐
Bosta API (opt.) ──┼──▶ scripts/sync.ts ──▶ data/latest.json ──▶ Next.js (static export) ──▶ GitHub Pages
Google Sheet (opt.)─┘         ▲
                    GitHub Actions cron (every 4h)
```

- `src/lib/shopify.ts` — Shopify Admin GraphQL client, paginates orders since
  a lookback date, extracting financial/fulfillment status and the Bosta
  tracking info already attached to each order's fulfillment.
- `src/lib/bosta.ts` — Bosta API client. **Bosta's docs site (docs.bosta.co)
  blocks automated fetching**, so the exact response field names in
  `extractRawState()` are a best-effort guess from Bosta's published Node SDK,
  not a verified schema. Once you have a real `BOSTA_API_KEY`, run the sync
  once, log a raw response for one tracking number, and adjust
  `extractRawState` / `normalizeBostaState` in that file if the field names
  differ — they're intentionally isolated there as the one place to fix.
- `src/lib/sheets.ts` — reads the "Refunds/Instapay/C. S." Google Sheet via
  the Sheets API (service account auth) and classifies each row's messy
  free-text notes (Arabic/English, e.g. "Cancel", "Faild", "منتظرين رد منها")
  into `collected` / `pending` / `failed` via keyword matching in
  `classifyInstapayStatus`. Extend the keyword lists there if new note
  wordings show up.
- `src/lib/metrics.ts` — combines all three sources into per-day metrics.
  When no Bosta lookup succeeds for an order, `fallbackStateFromShopify`
  derives a coarse shipping state from Shopify's own fulfillment
  status/tags — good enough for a trend, not a substitute for real Bosta
  data.
- `scripts/sync.ts` — orchestrates the fetch + merges new days into the
  existing `data/latest.json` (so historical days outside the lookback
  window are preserved run over run).
- `src/app/`, `src/components/` — the dashboard UI (date-range filter, KPI
  tiles, revenue trend, shipping-status stacked chart, collections
  breakdown, and a table view of the underlying daily data).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the secrets you have
npm run dev                  # dashboard at http://localhost:3000, reads data/latest.json
npm run sync                 # fetch fresh data into data/latest.json
```

`scripts/sync.ts` auto-loads `.env.local` if present (via Node's
`process.loadEnvFile`), so no extra dotenv setup is needed.

## Deployment (GitHub Pages)

1. Add the secrets listed above under **Settings → Secrets and variables →
   Actions → Repository secrets**.
2. Enable **Settings → Pages → Source: GitHub Actions**.
3. The `sync-and-deploy.yml` workflow runs on a 4-hour schedule, on manual
   dispatch, and on every push to `main` (excluding data-only commits it
   makes itself, to avoid a trigger loop). Each run re-syncs the data,
   commits `data/latest.json` if it changed, rebuilds the static site, and
   redeploys to Pages.

## Known limitations

- **Bosta field names are unverified** (see `src/lib/bosta.ts`) — the docs
  site blocked automated access during development. Verify against a real
  API response before trusting the shipping-state breakdown over the
  Shopify-derived fallback.
- **InstaPay sheet parsing is keyword-based**, not a guaranteed classification
  — it's reading a manually-maintained log with inconsistent free-text notes,
  not a structured export. Spot-check `classifyInstapayStatus` results
  periodically and extend the keyword lists as new phrasing appears in the
  sheet.
- Order-to-InstaPay-row matching is by normalized order number (digits only),
  so it depends on the sheet's "Order number" column actually containing the
  Shopify order number.
