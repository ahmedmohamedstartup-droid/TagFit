"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, formatDate } from "@/lib/format";
import { StatTile } from "./StatTile";
import { LineChart } from "./LineChart";
import { StackedBarChart } from "./StackedBarChart";
import { DateRangePicker, daysForPreset, type RangePreset } from "./DateRangePicker";

function statusFor(value: number, goodMin: number, warnMin: number): "good" | "warning" | "critical" {
  if (value >= goodMin) return "good";
  if (value >= warnMin) return "warning";
  return "critical";
}

export function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [showTable, setShowTable] = useState(false);

  const allDates = snapshot.days.map((d) => d.date);
  const n = daysForPreset(preset, allDates);
  const filtered = useMemo(() => snapshot.days.slice(-n), [snapshot.days, n]);

  const totals = useMemo(() => {
    const ordersCount = filtered.reduce((s, d) => s + d.orders.count, 0);
    const revenue = filtered.reduce((s, d) => s + d.orders.revenue, 0);
    const shippingTotal = filtered.reduce((s, d) => s + d.shipping.total, 0);
    const delivered = filtered.reduce((s, d) => s + d.shipping.delivered, 0);
    const returned = filtered.reduce((s, d) => s + d.shipping.returned, 0);
    const collectionsTotal = filtered.reduce((s, d) => s + d.collections.totalAmount, 0);
    const collected = filtered.reduce((s, d) => s + d.collections.collectedAmount, 0);
    const pendingAmt = filtered.reduce((s, d) => s + d.collections.pendingAmount, 0);
    const failedAmt = filtered.reduce((s, d) => s + d.collections.failedAmount, 0);

    return {
      ordersCount,
      revenue,
      avgOrderValue: ordersCount ? revenue / ordersCount : 0,
      deliveryRate: shippingTotal ? delivered / shippingTotal : 0,
      returnRate: shippingTotal ? returned / shippingTotal : 0,
      collectedRate: collectionsTotal ? collected / collectionsTotal : 0,
      collected,
      pendingAmt,
      failedAmt,
    };
  }, [filtered]);

  const shippingSegments = [
    { key: "delivered", label: "تم التسليم", color: "var(--status-good)" },
    { key: "inTransit", label: "جاري الشحن", color: "var(--status-warning)" },
    { key: "pending", label: "قيد الانتظار", color: "var(--text-muted)" },
    { key: "returned", label: "مرتجع", color: "var(--status-critical)" },
    { key: "cancelled", label: "ملغي", color: "var(--status-serious)" },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">الحالة العامة للبراند — TagFit</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {snapshot.generatedAt
              ? `آخر تحديث: ${new Date(snapshot.generatedAt).toLocaleString("ar-EG")}`
              : "لسه معملتش أول مزامنة بيانات"}
          </p>
        </div>
        <DateRangePicker value={preset} onChange={setPreset} />
      </header>

      <section className="flex flex-wrap gap-3">
        <StatTile label="الإيرادات" value={formatCurrency(totals.revenue)} />
        <StatTile label="عدد الأوردرات" value={formatNumber(totals.ordersCount)} />
        <StatTile label="متوسط قيمة الأوردر" value={formatCurrency(totals.avgOrderValue)} />
        <StatTile
          label="نسبة التسليم"
          value={formatPercent(totals.deliveryRate)}
          status={statusFor(totals.deliveryRate, 0.85, 0.7)}
        />
        <StatTile
          label="نسبة المرتجعات"
          value={formatPercent(totals.returnRate)}
          status={statusFor(1 - totals.returnRate, 0.85, 0.7)}
        />
        <StatTile
          label="نسبة التحصيل (إنستاباي)"
          value={formatPercent(totals.collectedRate)}
          status={statusFor(totals.collectedRate, 0.8, 0.5)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">اتجاه الإيرادات</h2>
        <div className="rounded-lg p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <LineChart
            points={filtered.map((d) => ({ date: formatDate(d.date), value: d.orders.revenue }))}
            formatValue={formatCurrency}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">حالة الشحن (بوسطة)</h2>
        <div className="rounded-lg p-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <StackedBarChart
            points={filtered.map((d) => ({
              date: formatDate(d.date),
              values: {
                delivered: d.shipping.delivered,
                inTransit: d.shipping.inTransit,
                pending: d.shipping.pending,
                returned: d.shipping.returned,
                cancelled: d.shipping.cancelled,
              },
            }))}
            segments={shippingSegments}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-medium">التحصيلات (إنستاباي)</h2>
        <div className="flex flex-wrap gap-3">
          <StatTile label="متحصّل" value={formatCurrency(totals.collected)} status="good" />
          <StatTile label="لسه منتظر" value={formatCurrency(totals.pendingAmt)} status="warning" />
          <StatTile label="فشل/اتلغى" value={formatCurrency(totals.failedAmt)} status="critical" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">بيانات يومية</h2>
          <button
            onClick={() => setShowTable((v) => !v)}
            className="text-sm underline"
            style={{ color: "var(--text-secondary)" }}
          >
            {showTable ? "إخفاء الجدول" : "عرض كجدول"}
          </button>
        </div>
        {showTable && (
          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr style={{ background: "var(--surface-1)" }}>
                  {["التاريخ", "الأوردرات", "الإيرادات", "تم التسليم", "مرتجع", "متحصّل", "منتظر", "فشل"].map((h) => (
                    <th key={h} className="p-2 text-start font-medium" style={{ color: "var(--text-secondary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice()
                  .reverse()
                  .map((d) => (
                    <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="p-2">{d.date}</td>
                      <td className="p-2">{formatNumber(d.orders.count)}</td>
                      <td className="p-2">{formatCurrency(d.orders.revenue)}</td>
                      <td className="p-2">{formatNumber(d.shipping.delivered)}</td>
                      <td className="p-2">{formatNumber(d.shipping.returned)}</td>
                      <td className="p-2">{formatCurrency(d.collections.collectedAmount)}</td>
                      <td className="p-2">{formatCurrency(d.collections.pendingAmount)}</td>
                      <td className="p-2">{formatCurrency(d.collections.failedAmount)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-xs pt-4" style={{ color: "var(--text-muted)" }}>
        مصادر البيانات: شوبيفاي ({formatNumber(snapshot.source.shopifyOrders)} أوردر) · بوسطة (
        {formatNumber(snapshot.source.bostaShipments)} شحنة) · شيت الإنستاباي/المرتجعات (
        {formatNumber(snapshot.source.instapayRows)} صف)
      </footer>
    </div>
  );
}
