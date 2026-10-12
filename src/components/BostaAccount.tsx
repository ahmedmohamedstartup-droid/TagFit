"use client";

import { useState } from "react";
import type { BostaAccountSummary, BostaBucket } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { StatTile } from "./StatTile";
import { StackedBarChart } from "./StackedBarChart";

const BUCKET_LABEL: Record<BostaBucket, string> = {
  created: "مستني البيك أب",
  in_transit: "جاري الشحن",
  exception: "مشكلة / محتاج تدخل",
  delivered: "تم التسليم",
  returned: "مرتجع",
  cancelled: "ملغي",
  lost: "مفقود / تالف",
  unknown: "غير معروف",
};

const BUCKET_ORDER: BostaBucket[] = [
  "delivered",
  "in_transit",
  "created",
  "exception",
  "returned",
  "lost",
  "cancelled",
  "unknown",
];

function statusFor(value: number, goodMin: number, warnMin: number): "good" | "warning" | "critical" {
  if (value >= goodMin) return "good";
  if (value >= warnMin) return "warning";
  return "critical";
}

const card = { background: "var(--surface-1)", border: "1px solid var(--border)" };

function BarList({ rows }: { rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
          <div className="h-2.5 rounded-sm" style={{ background: "var(--gridline)" }}>
            <div
              className="h-full rounded-sm"
              style={{ width: `${(r.value / max) * 100}%`, background: "var(--series-2)" }}
              title={`${r.label}: ${formatNumber(r.value)}`}
            />
          </div>
          <span className="tabular-nums min-w-[4.5rem] text-end">
            {formatNumber(r.value)}
            {r.hint && (
              <span className="text-xs ms-1" style={{ color: "var(--text-muted)" }}>
                {r.hint}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BostaAccount({ summary }: { summary: BostaAccountSummary | null | undefined }) {
  const [showAllCities, setShowAllCities] = useState(false);

  if (!summary) {
    return (
      <div className="rounded-lg p-6 text-sm space-y-2" style={card}>
        <p>لسه مفيش بيانات من بوسطة.</p>
        <p style={{ color: "var(--text-muted)" }}>
          ضيف <code>BOSTA_API_KEY</code> في Secrets بتاعة الريبو، وشغّل الـ workflow من تبويب Actions.
        </p>
      </div>
    );
  }

  const b = summary.byBucket;
  const statusRows = BUCKET_ORDER.filter((k) => b[k] > 0).map((k) => ({
    label: BUCKET_LABEL[k],
    value: b[k],
    hint: summary.total ? formatPercent(b[k] / summary.total) : undefined,
  }));
  const cities = showAllCities ? summary.cities : summary.cities.slice(0, 6);

  return (
    <div className="space-y-8">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        كل الشحنات اللي اتعملت من {summary.since} · آخر تحديث{" "}
        {new Date(summary.generatedAt).toLocaleString("ar-EG")}
      </p>

      <section className="flex flex-wrap gap-3">
        <StatTile label="إجمالي الشحنات" value={formatNumber(summary.total)} />
        <StatTile
          label="نسبة التسليم الناجح"
          value={formatPercent(summary.successRate)}
          status={statusFor(summary.successRate, 0.85, 0.7)}
          hint="من الشحنات اللي خلصت (اتسلمت أو رجعت)"
        />
        <StatTile
          label="شحنات مفتوحة"
          value={formatNumber(summary.openCount)}
          hint={`منها ${formatNumber(summary.stuckCount)} أقدم من ${summary.stuckAfterDays} أيام`}
          status={summary.stuckCount > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="محتاجة تدخل منك"
          value={formatNumber(b.exception)}
          status={b.exception > 0 ? "critical" : "good"}
        />
        <StatTile label="متوسط المحاولات للتسليم" value={summary.avgAttemptsToDeliver.toFixed(2)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">فلوس التحصيل (COD)</h2>
        <div className="flex flex-wrap gap-3">
          <StatTile
            label="اتحصّل من العملاء"
            value={formatCurrency(summary.cod.deliveredAmount)}
            hint="على الشحنات اللي اتسلمت"
          />
          <StatTile
            label="لسه في الطريق"
            value={formatCurrency(summary.cod.openAmount)}
            hint="على الشحنات المفتوحة"
          />
          <StatTile
            label="ضاع بسبب المرتجع"
            value={formatCurrency(summary.cod.returnedAmount)}
            hint="قيمة الشحنات اللي رجعت/اتفقدت"
          />
          {summary.fees && (
            <StatTile
              label="مصاريف الشحن"
              value={formatCurrency(summary.fees.total)}
              hint={`${formatCurrency(summary.fees.perShipment)} للشحنة في المتوسط`}
            />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">توزيع الشحنات حسب الحالة</h2>
        <div className="rounded-lg p-4" style={card}>
          <BarList rows={statusRows} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">تسليم مقابل مرتجع — أسبوعيًا</h2>
        <div className="rounded-lg p-4" style={card}>
          <StackedBarChart
            points={summary.weekly.map((w) => ({
              date: formatDate(w.week),
              values: { delivered: w.delivered, returned: w.returned },
            }))}
            segments={[
              { key: "delivered", label: "تم التسليم", color: "var(--status-good)" },
              { key: "returned", label: "مرتجع", color: "var(--status-critical)" },
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">أداء المحافظات / المدن</h2>
          {summary.cities.length > 6 && (
            <button
              onClick={() => setShowAllCities((v) => !v)}
              className="text-sm underline"
              style={{ color: "var(--text-secondary)" }}
            >
              {showAllCities ? "أقل" : "عرض الكل"}
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr style={{ background: "var(--surface-1)" }}>
                {["المدينة", "الشحنات", "اتسلم", "رجع", "نسبة النجاح"].map((h) => (
                  <th key={h} className="p-2 text-start font-medium" style={{ color: "var(--text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="p-2">{c.city}</td>
                  <td className="p-2">{formatNumber(c.total)}</td>
                  <td className="p-2">{formatNumber(c.delivered)}</td>
                  <td className="p-2">{formatNumber(c.returned)}</td>
                  <td className="p-2">
                    {c.delivered + c.returned ? formatPercent(c.successRate) : "—"}
                    {c.delivered + c.returned >= 5 && c.successRate < 0.7 && (
                      <span className="text-xs ms-2" style={{ color: "var(--status-critical)" }}>
                        ● ضعيفة
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {summary.types.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-base font-medium">نوع الشحنة</h2>
          <div className="rounded-lg p-4" style={card}>
            <BarList rows={summary.types.map((t) => ({ label: t.type, value: t.count }))} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">شحنات محتاجة متابعة</h2>
        {summary.needsAttention.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            مفيش شحنات متأخرة أو فيها مشكلة دلوقتي.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr style={{ background: "var(--surface-1)" }}>
                  {["رقم التتبع", "رقم الأوردر", "الحالة", "المدينة", "COD", "محاولات", "عمرها (يوم)"].map((h) => (
                    <th key={h} className="p-2 text-start font-medium" style={{ color: "var(--text-secondary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.needsAttention.map((s) => (
                  <tr key={s.trackingNumber} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="p-2">{s.trackingNumber}</td>
                    <td className="p-2">{s.businessReference ?? "—"}</td>
                    <td className="p-2">
                      {s.bucket === "exception" && (
                        <span className="me-1" style={{ color: "var(--status-critical)" }}>
                          ●
                        </span>
                      )}
                      {s.state}
                    </td>
                    <td className="p-2">{s.city ?? "—"}</td>
                    <td className="p-2">{formatCurrency(s.cod)}</td>
                    <td className="p-2">{formatNumber(s.attempts)}</td>
                    <td className="p-2">{formatNumber(s.ageDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
