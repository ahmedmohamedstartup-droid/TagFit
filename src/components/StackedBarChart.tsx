"use client";

import { useState } from "react";

export interface StackSegment {
  key: string;
  label: string;
  color: string;
}

interface StackedBarPoint {
  date: string;
  values: Record<string, number>;
}

export function StackedBarChart({
  points,
  segments,
  height = 200,
}: {
  points: StackedBarPoint[];
  segments: StackSegment[];
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 640;
  const padding = 24;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ height, color: "var(--text-muted)" }}
      >
        لا توجد بيانات كافية
      </div>
    );
  }

  const totals = points.map((p) => segments.reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0));
  const max = Math.max(...totals, 1);

  const plotHeight = height - padding * 2;
  const barSlot = (width - padding * 2) / points.length;
  const barWidth = Math.max(barSlot * 0.6, 4);
  const gap = 2;

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} onMouseLeave={() => setHoverIdx(null)}>
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const x = padding + i * barSlot + (barSlot - barWidth) / 2;
          let yCursor = height - padding;
          const rects = segments.map((seg) => {
            const value = p.values[seg.key] ?? 0;
            const segHeight = (value / max) * plotHeight;
            const y = yCursor - segHeight;
            yCursor -= segHeight + (segHeight > 0 ? gap : 0);
            return { seg, y, segHeight, value };
          });
          return (
            <g key={p.date}>
              {rects.map(({ seg, y, segHeight }, si) => (
                <rect
                  key={seg.key}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(segHeight, 0)}
                  fill={seg.color}
                  rx={si === rects.length - 1 ? 2 : 0}
                />
              ))}
              <rect
                x={x - (barSlot - barWidth) / 2}
                y={0}
                width={barSlot}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            </g>
          );
        })}
        <text x={padding} y={height - 6} fontSize={11} fill="var(--text-muted)" textAnchor="start">
          {points[0].date}
        </text>
        {points.length > 1 && (
          <text x={width - padding} y={height - 6} fontSize={11} fill="var(--text-muted)" textAnchor="end">
            {points[points.length - 1].date}
          </text>
        )}
      </svg>
      {hovered && (
        <div
          className="absolute top-0 rounded px-2 py-1.5 text-xs pointer-events-none space-y-0.5"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            left: `${((padding + hoverIdx! * barSlot + barSlot / 2) / width) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div style={{ color: "var(--text-muted)" }}>{hovered.date}</div>
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: seg.color }} />
              <span>{seg.label}:</span>
              <span className="tabular-nums font-medium">{hovered.values[seg.key] ?? 0}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3 mt-2">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: seg.color }} />
            {seg.label}
          </div>
        ))}
      </div>
    </div>
  );
}
