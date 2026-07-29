"use client";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "all";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "7d", label: "آخر 7 أيام" },
  { key: "30d", label: "آخر 30 يومًا" },
  { key: "90d", label: "آخر 90 يومًا" },
  { key: "all", label: "كل الفترة" },
];

export function DateRangePicker({ value, onChange }: { value: RangePreset; onChange: (v: RangePreset) => void }) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      {PRESETS.map((p) => {
        const active = p.key === value;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className="px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              background: active ? "var(--series-1)" : "transparent",
              color: active ? "#fff" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function daysForPreset(preset: RangePreset, allDates: string[]): number {
  if (preset === "all") return allDates.length;
  if (preset === "today") return 1;
  if (preset === "7d") return 7;
  if (preset === "30d") return 30;
  return 90;
}
