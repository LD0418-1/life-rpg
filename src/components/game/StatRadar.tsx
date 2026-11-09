"use client";

import { useState } from "react";

export interface RadarStat {
  id: string;
  label: string;
  level: number;
  totalXp: number;
}

/**
 * Pentagon chart of domain levels. One series, so no legend: the panel title
 * names it, and the domain list next to it doubles as the table view.
 */
export function StatRadar({ stats }: { stats: RadarStat[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const size = 300;
  const c = size / 2;
  const r = 104;
  const maxLevel = Math.max(10, Math.ceil(Math.max(...stats.map((s) => s.level)) / 5) * 5);

  const point = (i: number, value: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / stats.length;
    const dist = (value / maxLevel) * r;
    return [c + dist * Math.cos(angle), c + dist * Math.sin(angle)] as const;
  };
  const ring = (fraction: number) => stats.map((_, i) => point(i, maxLevel * fraction).join(",")).join(" ");
  const shape = stats.map((s, i) => point(i, s.level).join(",")).join(" ");
  const hovered = stats.find((s) => s.id === hover);

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Domain levels">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={ring(f)} fill="none" stroke="var(--ink-3)" strokeWidth={f === 1 ? 2 : 1} />
        ))}
        {stats.map((s, i) => {
          const [x, y] = point(i, maxLevel);
          return <line key={s.id} x1={c} y1={c} x2={x} y2={y} stroke="var(--ink-3)" strokeWidth={1} />;
        })}
        <polygon
          points={shape}
          fill="color-mix(in srgb, var(--crimson) 35%, transparent)"
          stroke="var(--crimson)"
          strokeWidth={2}
          strokeLinejoin="round"
          className="transition-all duration-500"
        />
        {stats.map((s, i) => {
          const [x, y] = point(i, s.level);
          const [lx, ly] = point(i, maxLevel * 1.24);
          const active = hover === s.id;
          return (
            <g key={s.id}>
              <circle cx={x} cy={y} r={active ? 6 : 4.5} fill="var(--crimson)" stroke="var(--ink-2)" strokeWidth={2} />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-label text-[15px] font-extrabold tracking-wider uppercase"
                fill={active ? "var(--paper)" : "var(--muted)"}
              >
                {s.label} {s.level}
              </text>
              {/* hit target bigger than the mark */}
              <circle
                cx={x}
                cy={y}
                r={18}
                fill="transparent"
                tabIndex={0}
                aria-label={`${s.label}: level ${s.level}, ${s.totalXp} XP`}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.id)}
                onBlur={() => setHover(null)}
                className="cursor-pointer outline-none"
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute top-2 left-2 bg-paper px-3 py-1.5 text-ink shadow-[3px_3px_0_var(--crimson)]">
          <div className="font-label text-sm font-extrabold tracking-wider uppercase">{hovered.label}</div>
          <div className="text-sm">
            Lv {hovered.level} · {hovered.totalXp.toLocaleString()} XP
          </div>
        </div>
      )}
    </div>
  );
}
