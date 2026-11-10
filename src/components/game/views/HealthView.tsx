"use client";

// Health: everything your iPhone sends from Apple Health, day by day.
// Tiles show each metric at a glance; tap one for its chart and numbers.
// Private: visitors never see this page or its data.
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { GROUPS, type MetricRow, formatMetric, metricInfo } from "@/lib/health/metrics";
import { addDays } from "@/lib/game/streaks";
import type { HealthData } from "@/lib/game/types";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 60 ? `${Math.max(1, min)} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};

/** Every day from `from` to `to`, with the metric's value or null. */
function series(rows: MetricRow[], from: string, to: string): { day: string; row: MetricRow | null }[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; row: MetricRow | null }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, row: byDay.get(d) ?? null });
  return out;
}

/** The number a tile shows for a stretch: daily average for totals and readings, latest for "last" metrics. */
function headline(id: string, rows: MetricRow[]): number | null {
  if (!rows.length) return null;
  if (metricInfo(id).agg === "last") return rows[rows.length - 1].value;
  return rows.reduce((s, r) => s + r.value, 0) / rows.length;
}

/** Round y-axis ticks: 0 and 2-3 clean steps up to the max. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < max) out.push(Math.round((out[out.length - 1] + step) * 1000) / 1000);
  return out;
}
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n.toLocaleString("en", { maximumFractionDigits: 1 }));

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A 12-ish point trend line in the quiet color, today's dot in the accent. */
function Sparkline({ points }: { points: (number | null)[] }) {
  const W = 120;
  const H = 28;
  const vals = points.filter((p): p is number => p !== null);
  if (vals.length < 2) return <span className="block h-7" />;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => (i / (points.length - 1)) * (W - 8) + 4;
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8));
  let d = "";
  points.forEach((p, i) => {
    if (p === null) return;
    d += `${d && points[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`;
  });
  const lastIdx = points.map((p, i) => (p === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  // The line stretches to the tile's width; the end dot is drawn on top so it stays round.
  return (
    <span className="relative block h-7 w-full" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <path d={d} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-crimson ring-2 ring-ink-2"
        style={{ left: `${(x(lastIdx) / W) * 100}%`, top: `${(y(points[lastIdx]!) / H) * 100}%` }}
      />
    </span>
  );
}

function MetricTile({ id, rows, prevRows, from, to, selected, onSelect }: { id: string; rows: MetricRow[]; prevRows: MetricRow[]; from: string; to: string; selected: boolean; onSelect: () => void }) {
  const info = metricInfo(id);
  const now = headline(id, rows);
  const before = headline(id, prevRows);
  const delta = now !== null && before !== null && before !== 0 ? ((now - before) / before) * 100 : null;
  const points = series(rows, from, to).map((s) => s.row?.value ?? null);
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`slash-panel flex flex-col items-start gap-1 p-4 text-left transition-colors ${selected ? "bg-paper text-ink [&_.tile-muted]:text-ink/70" : "bg-ink-2 hover:bg-ink-3"}`}
    >
      <span className="tile-muted font-label text-xs font-extrabold tracking-widest text-muted uppercase">{info.label}</span>
      <span className="font-display text-3xl leading-none">{formatMetric(id, now, false)}</span>
      <span className="tile-muted text-xs text-muted">
        {info.unit && `${info.unit} · `}
        {info.agg === "last" ? "latest" : info.agg === "sum" ? "a day, on average" : "average"}
        {delta !== null && Math.abs(delta) >= 0.5 && (
          <>
            {" · "}
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs before
          </>
        )}
      </span>
      <span className="mt-1 w-full">
        <Sparkline points={points} />
      </span>
    </button>
  );
}

/** The big chart: columns for totals, a line (with the day's low–high band) for readings. */
function MetricChart({ id, rows, from, to }: { id: string; rows: MetricRow[]; from: string; to: string }) {
  const info = metricInfo(id);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const data = series(rows, from, to);
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const W = Math.max(width, 280);
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const hasBand = info.chart === "line" && rows.some((r) => r.max !== null);
  const top = Math.max(...rows.map((r) => (hasBand && r.max !== null ? r.max : r.value)), 0);
  const isLine = info.chart === "line";
  const low = isLine ? Math.min(...rows.map((r) => (hasBand && r.min !== null ? r.min : r.value))) : 0;
  // Lines don't need to start at 0 (a resting heart rate of 55–65 would be a flat line otherwise).
  const yTicks = isLine ? niceRange(low, top) : ticks(top);
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const y = (v: number) => pad.top + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
  const slot = innerW / data.length;
  const x = (i: number) => pad.left + slot * i + slot / 2;
  const barW = Math.max(1, Math.min(24, slot - 2));
  const r = Math.min(4, barW / 2);

  let line = "";
  let band = "";
  if (isLine) {
    data.forEach((d, i) => {
      if (!d.row) return;
      line += `${line && data[i - 1]?.row ? "L" : "M"}${x(i).toFixed(1)},${y(d.row.value).toFixed(1)}`;
    });
    if (hasBand) {
      // One band piece per run of days that have data.
      let run: number[] = [];
      const flush = () => {
        if (run.length > 1) {
          const upper = run.map((i) => `${x(i).toFixed(1)},${y(data[i].row!.max ?? data[i].row!.value).toFixed(1)}`);
          const lower = [...run].reverse().map((i) => `${x(i).toFixed(1)},${y(data[i].row!.min ?? data[i].row!.value).toFixed(1)}`);
          band += `M${upper.join("L")}L${lower.join("L")}Z`;
        }
        run = [];
      };
      data.forEach((d, i) => (d.row ? run.push(i) : flush()));
      flush();
    }
  }
  const lastIdx = data.map((d, i) => (d.row ? i : -1)).filter((i) => i >= 0).pop();
  const h = hover !== null ? data[hover] : null;
  const labelEvery = Math.ceil(data.length / 5);

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} role="img" aria-label={`${info.label}, ${shortDay(from)} to ${shortDay(to)}`} onMouseLeave={() => setHover(null)} className="block max-w-full">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.day} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
              {shortDay(d.day)}
            </text>
          ) : null,
        )}
        {isLine ? (
          <>
            {band && <path d={band} fill="var(--crimson)" opacity={0.12} />}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--muted)" strokeWidth={1} />}
            <path d={line} fill="none" stroke="var(--crimson)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* Days with a lone reading (no neighbor) still get a visible mark. */}
            {data.map((d, i) =>
              d.row && !data[i - 1]?.row && !data[i + 1]?.row && i !== lastIdx ? <circle key={d.day} cx={x(i)} cy={y(d.row.value)} r={3} fill="var(--crimson)" /> : null,
            )}
            {lastIdx !== undefined && <circle cx={x(lastIdx)} cy={y(data[lastIdx].row!.value)} r={4} fill="var(--crimson)" stroke="var(--ink-2)" strokeWidth={2} />}
            {h?.row && <circle cx={x(hover!)} cy={y(h.row.value)} r={4.5} fill="var(--crimson)" stroke="var(--ink-2)" strokeWidth={2} />}
          </>
        ) : (
          data.map((d, i) => {
            if (!d.row || d.row.value <= 0) return null;
            const bx = x(i) - barW / 2;
            const by = y(d.row.value);
            const bh = y(0) - by;
            const rr = Math.min(r, bh);
            // Rounded data-end, square at the baseline.
            const path = `M${bx},${y(0)}V${by + rr}Q${bx},${by} ${bx + rr},${by}H${bx + barW - rr}Q${bx + barW},${by} ${bx + barW},${by + rr}V${y(0)}Z`;
            return <path key={d.day} d={path} fill="var(--crimson)" opacity={hover === null || hover === i ? 1 : 0.45} />;
          })
        )}
        {/* Hover targets: the whole day column, bigger than the mark. */}
        {data.map((d, i) => (
          <rect key={d.day} x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 bg-paper px-3 py-1.5 text-xs whitespace-nowrap text-ink shadow-[3px_3px_0_var(--crimson)]"
          style={{ left: Math.min(Math.max(x(hover), 70), W - 70) }}
        >
          <div className="font-label font-extrabold tracking-wider uppercase">{longDay(h.day)}</div>
          <div className="font-semibold">{h.row ? formatMetric(id, h.row.value) : "No data"}</div>
          {h.row && h.row.min !== null && h.row.max !== null && (
            <div className="text-ink/70">
              Low {formatMetric(id, h.row.min, false)} · high {formatMetric(id, h.row.max, false)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Clean ticks for a line that doesn't start at 0. */
function niceRange(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) return [Math.max(0, lo - 1), lo, lo + 1];
  const raw = (hi - lo) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.max(0, Math.floor(lo / step) * step);
  const out: number[] = [];
  for (let v = start; v < hi + step; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function MetricDetail({ id, rows, from, to }: { id: string; rows: MetricRow[]; from: string; to: string }) {
  const info = metricInfo(id);
  const [table, setTable] = useState(false);
  const values = rows.map((r) => r.value);
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const total = info.agg === "sum" ? values.reduce((s, v) => s + v, 0) : null;
  const best = rows.length ? rows.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  return (
    <Panel title={info.label} kicker={`${shortDay(from)} – ${shortDay(to)}`}>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span><span className="text-muted">Average </span><strong>{formatMetric(id, avg)}</strong></span>
        {total !== null && <span><span className="text-muted">Total </span><strong>{formatMetric(id, total)}</strong></span>}
        {best && <span><span className="text-muted">Highest day </span><strong>{formatMetric(id, best.value)}</strong> <span className="text-muted">({shortDay(best.day)})</span></span>}
        <span><span className="text-muted">Days with data </span><strong>{rows.length}</strong></span>
        <button onClick={() => setTable((t) => !t)} className="ml-auto font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper" aria-expanded={table}>
          {table ? "Show chart" : "Show numbers"}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data in this stretch.</p>
      ) : table ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-ink-2 text-left font-label text-xs tracking-widest text-muted uppercase">
              <tr>
                <th className="py-1 font-extrabold">Day</th>
                <th className="py-1 text-right font-extrabold">{info.label}</th>
                {rows.some((r) => r.min !== null) && <th className="py-1 text-right font-extrabold">Low – high</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-3">
              {[...rows].reverse().map((r) => (
                <tr key={r.day}>
                  <td className="py-1">{longDay(r.day)}</td>
                  <td className="py-1 text-right">{formatMetric(id, r.value)}</td>
                  {rows.some((x) => x.min !== null) && <td className="py-1 text-right text-muted">{r.min !== null ? `${formatMetric(id, r.min, false)} – ${formatMetric(id, r.max, false)}` : ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <MetricChart id={id} rows={rows} from={from} to={to} />
      )}
    </Panel>
  );
}

export function HealthView() {
  const { data, backend, canEdit, basePath } = useGame();
  const [range, setRange] = useState<Range>(30);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const to = data.today;
  const from = addDays(to, -(range - 1));
  const prevFrom = addDays(from, -range);

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    setError(null);
    // Twice the range, so tiles can compare with the stretch before.
    backend.loadHealth(prevFrom, to).then(
      (h) => live && setHealth(h),
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load your health data."),
    );
    return () => {
      live = false;
    };
  }, [backend, canEdit, prevFrom, to]);

  const byMetric = useMemo(() => {
    const map = new Map<string, MetricRow[]>();
    for (const r of health?.metrics ?? []) {
      if (!map.has(r.metric)) map.set(r.metric, []);
      map.get(r.metric)!.push(r);
    }
    return map;
  }, [health]);

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-8">
        <PageHeader kicker="Apple Health" title="Health" />
        <p className="text-muted">Health data is private.</p>
      </main>
    );
  }

  const inRange = (rows: MetricRow[]) => rows.filter((r) => r.day >= from && r.day <= to);
  const before = (rows: MetricRow[]) => rows.filter((r) => r.day >= prevFrom && r.day < from);
  const shown = [...byMetric.keys()].filter((id) => inRange(byMetric.get(id)!).length > 0);
  const current = selected && shown.includes(selected) ? selected : (shown.find((id) => id === "steps") ?? shown[0] ?? null);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Apple Health" title="Health">
        <div className="flex items-center gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`skew-box px-4 py-1 font-label text-sm font-extrabold tracking-wider uppercase ${range === r ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </PageHeader>

      {error && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}

      {!health ? (
        !error && <div className="h-64 animate-pulse bg-ink-2" aria-label="Loading health data" />
      ) : !health.ready ? (
        <Panel title="One step left">
          <p className="text-sm text-muted">
            The Health page needs a one-time database update: run <code>supabase/migrations/0009_health_metrics.sql</code> in the Supabase SQL Editor.
          </p>
        </Panel>
      ) : shown.length === 0 ? (
        <EmptyState
          glyph="♥"
          title={health.connected ? "No health data in this stretch" : "Connect Apple Health"}
          action={
            <Link href={`${basePath}/inbox`} className="skew-box inline-block bg-crimson px-5 py-2 font-label font-extrabold tracking-wider text-paper uppercase hover:bg-paper hover:text-ink">
              {health.connected ? "Check the Shortcut →" : "Set it up in the Inbox →"}
            </Link>
          }
        >
          {health.connected
            ? `Your iPhone last sent data ${ago(health.lastSyncedAt)}. Run the Life RPG Shortcut once to fill this in.`
            : "An iPhone Shortcut sends your steps, sleep, heart rate and more here every day."}
        </EmptyState>
      ) : (
        <>
          <p className="-mt-4 mb-8 text-sm text-muted">
            From your iPhone, last received {ago(health.lastSyncedAt)}. Steps, workouts, runs, mindful minutes and sleep also go to your{" "}
            <Link href={`${basePath}/inbox`} className="underline hover:text-paper">Inbox</Link> for XP.
          </p>
          {current && (
            <div className="mb-10">
              <MetricDetail id={current} rows={inRange(byMetric.get(current)!)} from={from} to={to} />
            </div>
          )}
          <div className="space-y-10">
            {GROUPS.map((g) => {
              const ids = shown.filter((id) => metricInfo(id).group === g.id);
              if (!ids.length) return null;
              return (
                <section key={g.id} aria-labelledby={`group-${g.id}`}>
                  <h2 id={`group-${g.id}`} className="mb-3 font-display text-2xl uppercase">{g.label}</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {ids.map((id) => (
                      <MetricTile
                        key={id}
                        id={id}
                        rows={inRange(byMetric.get(id)!)}
                        prevRows={before(byMetric.get(id)!)}
                        from={from}
                        to={to}
                        selected={id === current}
                        onSelect={() => {
                          setSelected(id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="mt-10 text-xs text-muted">Health data is private: it&apos;s never shown to visitors and isn&apos;t in your public page.</p>
        </>
      )}
    </main>
  );
}
