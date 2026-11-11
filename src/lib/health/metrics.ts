// Apple Health: every metric the iPhone Shortcut can send, and how a day's
// samples are combined (steps add up, heart rate is averaged, weight takes the
// latest). Pure code, shared by the server, the Health page and the preview.
//
// Any key not in this list is still accepted and stored ("other"), so you can
// add more Apple Health types to the Shortcut without changing the code.
import { isDay } from "../game/streaks";

export type MetricGroup = "activity" | "heart" | "sleep" | "body" | "mind" | "nutrition" | "other";
/** sum = add samples up · avg = average · last = latest sample · max / min */
export type Aggregate = "sum" | "avg" | "last" | "max" | "min";
/** Inbox items (XP) a metric can turn into. */
export type HealthKind = "steps" | "workout" | "run" | "mindful" | "sleep";

export interface MetricInfo {
  id: string;
  label: string;
  unit: string;
  group: MetricGroup;
  agg: Aggregate;
  decimals: number;
  /** Values above this are rejected as a typo / wrong unit. */
  max: number;
  /** Bars for totals, a line for averages and readings. */
  chart: "bar" | "line";
  /** Becomes an inbox item worth XP. */
  xp?: HealthKind;
  /** Other names the Shortcut may use, with a factor to convert to `unit`. */
  aliases?: Record<string, number>;
}

export const METRICS: MetricInfo[] = [
  // Activity
  { id: "steps", label: "Steps", unit: "steps", group: "activity", agg: "sum", decimals: 0, max: 200_000, chart: "bar", xp: "steps" },
  { id: "distance_km", label: "Walking + running distance", unit: "km", group: "activity", agg: "sum", decimals: 1, max: 300, chart: "bar", aliases: { distance_m: 0.001, distance_mi: 1.609344 } },
  { id: "flights", label: "Flights climbed", unit: "flights", group: "activity", agg: "sum", decimals: 0, max: 1000, chart: "bar" },
  { id: "active_energy", label: "Active energy", unit: "kcal", group: "activity", agg: "sum", decimals: 0, max: 20_000, chart: "bar" },
  { id: "resting_energy", label: "Resting energy", unit: "kcal", group: "activity", agg: "sum", decimals: 0, max: 10_000, chart: "bar" },
  { id: "exercise_minutes", label: "Exercise minutes", unit: "min", group: "activity", agg: "sum", decimals: 0, max: 1440, chart: "bar" },
  { id: "stand_hours", label: "Stand hours", unit: "h", group: "activity", agg: "sum", decimals: 0, max: 24, chart: "bar" },
  { id: "workout_minutes", label: "Workouts", unit: "min", group: "activity", agg: "sum", decimals: 0, max: 1440, chart: "bar", xp: "workout" },
  { id: "run_minutes", label: "Running", unit: "min", group: "activity", agg: "sum", decimals: 0, max: 1440, chart: "bar", xp: "run" },
  // Heart
  { id: "heart_rate", label: "Heart rate (average)", unit: "bpm", group: "heart", agg: "avg", decimals: 0, max: 250, chart: "line" },
  { id: "resting_heart_rate", label: "Resting heart rate", unit: "bpm", group: "heart", agg: "avg", decimals: 0, max: 200, chart: "line" },
  { id: "walking_heart_rate", label: "Walking heart rate", unit: "bpm", group: "heart", agg: "avg", decimals: 0, max: 250, chart: "line" },
  { id: "hrv", label: "Heart rate variability", unit: "ms", group: "heart", agg: "avg", decimals: 0, max: 400, chart: "line" },
  { id: "blood_oxygen", label: "Blood oxygen", unit: "%", group: "heart", agg: "avg", decimals: 0, max: 100, chart: "line" },
  { id: "respiratory_rate", label: "Respiratory rate", unit: "breaths/min", group: "heart", agg: "avg", decimals: 1, max: 80, chart: "line" },
  { id: "vo2_max", label: "Cardio fitness (VO₂ max)", unit: "mL/kg/min", group: "heart", agg: "last", decimals: 1, max: 100, chart: "line" },
  { id: "blood_pressure_systolic", label: "Blood pressure (systolic)", unit: "mmHg", group: "heart", agg: "avg", decimals: 0, max: 300, chart: "line" },
  { id: "blood_pressure_diastolic", label: "Blood pressure (diastolic)", unit: "mmHg", group: "heart", agg: "avg", decimals: 0, max: 200, chart: "line" },
  // Sleep
  { id: "sleep_hours", label: "Sleep", unit: "h", group: "sleep", agg: "sum", decimals: 1, max: 24, chart: "bar", xp: "sleep", aliases: { sleep_minutes: 1 / 60 } },
  { id: "time_in_bed_hours", label: "Time in bed", unit: "h", group: "sleep", agg: "sum", decimals: 1, max: 24, chart: "bar", aliases: { time_in_bed_minutes: 1 / 60 } },
  { id: "deep_sleep_hours", label: "Deep sleep", unit: "h", group: "sleep", agg: "sum", decimals: 1, max: 24, chart: "bar", aliases: { deep_sleep_minutes: 1 / 60 } },
  { id: "rem_sleep_hours", label: "REM sleep", unit: "h", group: "sleep", agg: "sum", decimals: 1, max: 24, chart: "bar", aliases: { rem_sleep_minutes: 1 / 60 } },
  { id: "core_sleep_hours", label: "Core sleep", unit: "h", group: "sleep", agg: "sum", decimals: 1, max: 24, chart: "bar", aliases: { core_sleep_minutes: 1 / 60 } },
  // Body
  { id: "weight_kg", label: "Weight", unit: "kg", group: "body", agg: "last", decimals: 1, max: 500, chart: "line", aliases: { weight_lb: 0.45359237 } },
  { id: "body_fat", label: "Body fat", unit: "%", group: "body", agg: "last", decimals: 1, max: 100, chart: "line" },
  { id: "bmi", label: "Body mass index", unit: "", group: "body", agg: "last", decimals: 1, max: 100, chart: "line" },
  { id: "body_temperature", label: "Body temperature", unit: "°C", group: "body", agg: "avg", decimals: 1, max: 45, chart: "line" },
  // Mind
  { id: "mindful_minutes", label: "Mindful minutes", unit: "min", group: "mind", agg: "sum", decimals: 0, max: 1440, chart: "bar", xp: "mindful" },
  // Nutrition
  { id: "water_ml", label: "Water", unit: "mL", group: "nutrition", agg: "sum", decimals: 0, max: 20_000, chart: "bar", aliases: { water_l: 1000 } },
  { id: "caffeine_mg", label: "Caffeine", unit: "mg", group: "nutrition", agg: "sum", decimals: 0, max: 5000, chart: "bar" },
  { id: "dietary_energy", label: "Calories eaten", unit: "kcal", group: "nutrition", agg: "sum", decimals: 0, max: 20_000, chart: "bar" },
  { id: "protein_g", label: "Protein", unit: "g", group: "nutrition", agg: "sum", decimals: 0, max: 1000, chart: "bar" },
];

export const GROUPS: { id: MetricGroup; label: string }[] = [
  { id: "activity", label: "Activity" },
  { id: "heart", label: "Heart" },
  { id: "sleep", label: "Sleep" },
  { id: "body", label: "Body" },
  { id: "mind", label: "Mind" },
  { id: "nutrition", label: "Nutrition" },
  { id: "other", label: "Other" },
];

const BY_ID = new Map(METRICS.map((m) => [m.id, m]));
const ALIAS = new Map<string, { metric: MetricInfo; factor: number }>();
for (const m of METRICS) for (const [name, factor] of Object.entries(m.aliases ?? {})) ALIAS.set(name, { metric: m, factor });

/** Info for any metric id, including ones not in the list ("other"). */
export function metricInfo(id: string): MetricInfo {
  return (
    BY_ID.get(id) ?? {
      id,
      label: id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      unit: "",
      group: "other",
      agg: "avg",
      decimals: 1,
      max: 10_000_000,
      chart: "line",
    }
  );
}

/** One metric on one day, as stored in health_metrics. */
export interface MetricRow {
  day: string;
  metric: string;
  value: number;
  min: number | null;
  max: number | null;
  /** How many samples were combined (1 for a single number). */
  samples: number;
}

/** An inbox item (worth XP once approved). Quantity: steps, or minutes. */
export interface HealthRow {
  kind: HealthKind;
  day: string;
  quantity: number;
}

const RESERVED = new Set(["date", "day", "token", "days", "metrics"]);
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
export const HEALTH_LIMITS = { days: 31, metricsPerDay: 60, samplesPerMetric: 5000 } as const;

/** "8,423", "72 count/min", 35.5 → a number. Shortcuts often sends numbers as text. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const m = v.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  if (v && typeof v === "object" && "value" in v) return toNumber((v as { value: unknown }).value);
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The day a date string names. Takes "2026-11-10" (also with a time after it) and
 * Shortcuts' own date text, like "Nov 10, 2026 at 9:30 PM" or "10 Nov 2026 at 21:30",
 * so the Shortcut can send Current Date without formatting it. Null if unreadable.
 */
export function readDate(text: string): string | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return isDay(iso[1]) ? iso[1] : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (month: string, day: string, year: string) => {
    const m = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
    if (m < 0) return null;
    const d = `${year}-${pad(m + 1)}-${pad(Number(day))}`;
    return isDay(d) ? d : null;
  };
  const us = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/); // Nov 10, 2026
  if (us) return build(us[1], us[2], us[3]);
  const eu = t.match(/(\d{1,2})\.?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/); // 10 Nov 2026
  if (eu) return build(eu[2], eu[1], eu[3]);
  return null; // 11/10/2026 could be November or October: not guessed
}

function combine(values: number[], agg: Aggregate): number {
  switch (agg) {
    case "sum":
      return values.reduce((s, v) => s + v, 0);
    case "avg":
      return values.reduce((s, v) => s + v, 0) / values.length;
    case "last":
      return values[values.length - 1];
    case "max":
      return Math.max(...values);
    case "min":
      return Math.min(...values);
  }
}

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** "steps" → "steps", "Resting Heart Rate" → "resting_heart_rate". */
const normalizeKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function parseDay(obj: Record<string, unknown>, fallbackDay: string | null): { day: string; rows: MetricRow[] } {
  const given = typeof obj.date === "string" ? obj.date : typeof obj.day === "string" ? obj.day : null;
  if (given === null && fallbackDay === null) throw new Error('Add a "date" field to the Shortcut (Current Date).');
  const rawDay = given === null ? fallbackDay : readDate(given);
  if (!rawDay || !isDay(rawDay)) throw new Error(`Couldn't read the date "${given}". Send Current Date, or format it as yyyy-MM-dd (like 2026-11-10).`);
  // Metrics can be at the top level or inside "metrics".
  const source = obj.metrics && typeof obj.metrics === "object" && !Array.isArray(obj.metrics) ? { ...obj, ...(obj.metrics as Record<string, unknown>) } : obj;
  const rows = new Map<string, MetricRow>();
  for (const [rawKey, raw] of Object.entries(source)) {
    if (RESERVED.has(rawKey) || raw === null || raw === undefined || raw === "") continue;
    const key = normalizeKey(rawKey);
    if (!KEY_RE.test(key)) throw new Error(`"${rawKey}" isn't a usable name. Use letters, numbers and _.`);
    const alias = ALIAS.get(key);
    const info = alias?.metric ?? metricInfo(key);
    const factor = alias?.factor ?? 1;
    // A list of samples can arrive as an array, or as text with one value per line.
    const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw.includes("\n") ? raw.split(/\n+/).filter((x) => x.trim()) : [raw];
    if (list.length > HEALTH_LIMITS.samplesPerMetric) throw new Error(`Too many samples for "${rawKey}".`);
    let values = list.map(toNumber).filter((n): n is number => n !== null).map((n) => n * factor);
    if (!values.length) {
      if (list.length) throw new Error(`"${rawKey}" must be a number (or a list of numbers).`);
      continue;
    }
    // Apple sends blood oxygen and body fat as fractions (0.97); show them as percent.
    if ((info.id === "blood_oxygen" || info.id === "body_fat") && values.every((v) => v <= 1)) values = values.map((v) => v * 100);
    if (values.some((v) => v < 0)) throw new Error(`"${rawKey}" can't be negative.`);
    const value = round(combine(values, info.agg), Math.max(info.decimals, 1));
    if (value > info.max) throw new Error(`"${rawKey}" is too large (${value}). Check the unit.`);
    rows.set(info.id, {
      day: rawDay,
      metric: info.id,
      value,
      min: values.length > 1 ? round(Math.min(...values), 2) : null,
      max: values.length > 1 ? round(Math.max(...values), 2) : null,
      samples: values.length,
    });
  }
  if (rows.size > HEALTH_LIMITS.metricsPerDay) throw new Error(`Send at most ${HEALTH_LIMITS.metricsPerDay} metrics per day.`);
  return { day: rawDay, rows: [...rows.values()] };
}

/**
 * Reads what the Shortcut sends. One day:
 *   { "date": "2026-11-10", "steps": 8423, "heart_rate": [62, 75, 88], "sleep_hours": 7.4 }
 * or several days: { "days": [ { "date": ..., ... }, ... ] }.
 * Returns every metric (for the Health page) and the inbox items worth XP.
 */
export function parseHealthPayload(body: unknown, fallbackDay: string | null): { metrics: MetricRow[]; items: HealthRow[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Send a JSON object.");
  const obj = body as Record<string, unknown>;
  const dayObjects = Array.isArray(obj.days) ? obj.days : [obj];
  if (dayObjects.length > HEALTH_LIMITS.days) throw new Error(`Send at most ${HEALTH_LIMITS.days} days at once.`);
  const metrics: MetricRow[] = [];
  for (const d of dayObjects) {
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("Each day must be a JSON object.");
    metrics.push(...parseDay(d as Record<string, unknown>, fallbackDay).rows);
  }
  if (!metrics.length) throw new Error("Nothing to import: send at least one metric, like steps or sleep_hours.");
  const items: HealthRow[] = [];
  for (const m of metrics) {
    const kind = metricInfo(m.metric).xp;
    if (!kind || m.value <= 0) continue;
    // Steps stay steps; everything else becomes minutes.
    const quantity = kind === "steps" ? Math.round(m.value) : kind === "sleep" ? Math.round(m.value * 60) : Math.round(m.value);
    if (quantity > 0) items.push({ kind, day: m.day, quantity });
  }
  return { metrics, items };
}

/** "8,423 steps", "7.4 h", "62 bpm". */
export function formatMetric(id: string, value: number | null | undefined, withUnit = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const info = metricInfo(id);
  const n = round(value, info.decimals).toLocaleString("en", { maximumFractionDigits: info.decimals, minimumFractionDigits: 0 });
  if (!withUnit || !info.unit) return n;
  return info.unit === "%" || info.unit === "°C" ? `${n}${info.unit}` : `${n} ${info.unit}`;
}
