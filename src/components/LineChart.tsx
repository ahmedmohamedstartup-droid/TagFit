"use client";

import { useState } from "react";

interface Point {
  date: string;
  value: number;
}

export function LineChart({
  points,
  color = "var(--series-1)",
  height = 180,
  formatValue,
}: {
  points: Point[];
  color?: string;
  height?: number;
  formatValue: (v: number) => string;
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

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const toX = (i: number) => padding + i * xStep;
  const toY = (v: number) => padding + (1 - (v - min) / range) * (height - padding * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.value)}`).join(" ");
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hoverIdx !== null && (
          <line
            x1={toX(hoverIdx)}
            y1={padding}
            x2={toX(hoverIdx)}
            y2={height - padding}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={toX(i)}
            cy={toY(p.value)}
            r={hoverIdx === i ? 5 : 3}
            fill={color}
            stroke="var(--surface-1)"
            strokeWidth={1.5}
          />
        ))}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={toX(i) - xStep / 2}
            y={0}
            width={xStep || width}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        <text x={toX(0)} y={height - 6} fontSize={11} fill="var(--text-muted)" textAnchor="start">
          {points[0].date}
        </text>
        {points.length > 1 && (
          <text x={toX(points.length - 1)} y={height - 6} fontSize={11} fill="var(--text-muted)" textAnchor="end">
            {points[points.length - 1].date}
          </text>
        )}
      </svg>
      {hovered && (
        <div
          className="absolute top-0 rounded px-2 py-1 text-xs pointer-events-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            left: `${(toX(hoverIdx!) / width) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div style={{ color: "var(--text-muted)" }}>{hovered.date}</div>
          <div className="tabular-nums font-medium">{formatValue(hovered.value)}</div>
        </div>
      )}
    </div>
  );
}
