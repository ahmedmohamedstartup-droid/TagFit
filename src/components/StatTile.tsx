type Status = "good" | "warning" | "serious" | "critical" | "neutral";

const STATUS_COLOR: Record<Status, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--text-secondary)",
};

const STATUS_LABEL: Record<Status, string> = {
  good: "جيد",
  warning: "تنبيه",
  serious: "يحتاج متابعة",
  critical: "حرج",
  neutral: "",
};

export function StatTile({
  label,
  value,
  status = "neutral",
  hint,
}: {
  label: string;
  value: string;
  status?: Status;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-1 min-w-[160px]"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {status !== "neutral" && (
        <span className="text-xs flex items-center gap-1" style={{ color: STATUS_COLOR[status] }}>
          ● {STATUS_LABEL[status]}
        </span>
      )}
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}
