// Your quick-log activities: the ones in xp.json plus your own changes.
//
// The database (activity_settings) stores only what you changed. For an
// activity from xp.json, an empty field means "use the xp.json value", so if
// you edit xp.json later, untouched fields follow along. Activities you add
// yourself have every field filled in.
import { type Activity, type GameConfig, gameConfig } from "./config";

/** An activity as the game uses it. */
export interface GameActivity extends Activity {
  /** Comes from xp.json (can be hidden or reset, not deleted). */
  builtIn: boolean;
  /** Hidden from the quick log. Still scored for imports and old entries. */
  hidden: boolean;
  /** A built-in activity with your own changes. */
  edited: boolean;
}

/** One row of activity_settings, camelCase. Null = not set. */
export interface ActivityOverride {
  slug: string;
  name: string | null;
  domain: string | null;
  unit: string | null;
  baseXp: number | null;
  xpPerUnit: number | null;
  maxUnits: number | null;
  defaultUnits: number | null;
  quick: boolean | null;
  hidden: boolean;
  position: number | null;
}

/** What the activity editor sends. */
export interface ActivityInput {
  name: string;
  domain: string;
  unit: string;
  baseXp: number;
  xpPerUnit: number;
  maxUnits: number;
  defaultUnits: number;
  quick: boolean;
}

export const ACTIVITY_LIMITS = { name: 40, unit: 20, baseXp: 500, xpPerUnit: 100, maxUnits: 100_000 } as const;
/** Suggestions for the unit field. "session" means one tap = one time (no amount). */
export const UNIT_SUGGESTIONS = ["minute", "session", "page", "rep", "km", "step", "chapter", "lesson"];

const FIELDS = ["name", "domain", "unit", "baseXp", "xpPerUnit", "maxUnits", "defaultUnits", "quick"] as const;

/** xp.json + your changes, in your order. Includes hidden ones (filter with `quickLogActivities`). */
export function mergeActivities(overrides: ReadonlyArray<ActivityOverride>, config: GameConfig = gameConfig): GameActivity[] {
  const bySlug = new Map(overrides.map((o) => [o.slug, o]));
  const domains = new Set(config.domains.map((d) => d.id));
  const list: { activity: GameActivity; order: number }[] = [];

  config.activities.forEach((base, i) => {
    const o = bySlug.get(base.slug);
    const merged: GameActivity = { ...base, builtIn: true, hidden: false, edited: false };
    if (o) {
      for (const f of FIELDS) {
        const v = o[f];
        if (v !== null && v !== undefined) (merged as unknown as Record<string, unknown>)[f] = v;
      }
      if (!domains.has(merged.domain)) merged.domain = base.domain;
      merged.hidden = o.hidden;
      merged.edited = FIELDS.some((f) => o[f] !== null && o[f] !== undefined && o[f] !== base[f]);
    }
    list.push({ activity: merged, order: o?.position ?? i });
  });

  const builtInSlugs = new Set(config.activities.map((a) => a.slug));
  for (const o of overrides) {
    if (builtInSlugs.has(o.slug)) continue;
    // Your own activity: skip it if it's incomplete or broken, rather than crash the page.
    if (o.name === null || o.domain === null || o.unit === null || o.baseXp === null || o.xpPerUnit === null || o.maxUnits === null || o.defaultUnits === null) continue;
    if (!domains.has(o.domain)) continue;
    list.push({
      activity: {
        slug: o.slug,
        name: o.name,
        domain: o.domain,
        unit: o.unit,
        baseXp: o.baseXp,
        xpPerUnit: o.xpPerUnit,
        maxUnits: o.maxUnits,
        defaultUnits: o.defaultUnits,
        quick: o.quick ?? true,
        builtIn: false,
        hidden: o.hidden,
        edited: false,
      },
      order: o.position ?? 1000 + list.length,
    });
  }

  return list.sort((a, b) => a.order - b.order).map((x) => x.activity);
}

/** The buttons on the quick log. */
export const quickLogActivities = (list: ReadonlyArray<GameActivity>) => list.filter((a) => a.quick && !a.hidden);

export function findActivity(slug: string, list: ReadonlyArray<Activity>): Activity {
  const a = list.find((x) => x.slug === slug);
  if (!a) throw new Error(`Unknown activity "${slug}". Refresh the page.`);
  return a;
}

/** The same config with your activities, for code that takes a GameConfig (imports). */
export const withActivities = (list: Activity[], config: GameConfig = gameConfig): GameConfig => ({ ...config, activities: list });

/** Checks and tidies what the editor sent. Throws a readable error. */
export function normalizeActivityInput(input: ActivityInput, config: GameConfig = gameConfig): ActivityInput {
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Give the activity a name.");
  if (name.length > ACTIVITY_LIMITS.name) throw new Error(`Keep the name under ${ACTIVITY_LIMITS.name} characters.`);
  if (!config.domains.some((d) => d.id === input.domain)) throw new Error("Pick a domain.");
  const unit = String(input.unit ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/(?<=[^s]{2})s$/, "") || "session"; // "minutes" → "minute"
  if (unit.length > ACTIVITY_LIMITS.unit) throw new Error(`Keep the unit under ${ACTIVITY_LIMITS.unit} characters.`);

  const num = (v: unknown, label: string, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max.toLocaleString("en")}.`);
    return Math.round(n * 1000) / 1000;
  };
  const baseXp = num(input.baseXp, "Base XP", 0, ACTIVITY_LIMITS.baseXp);
  const session = unit === "session";
  const xpPerUnit = session ? 0 : num(input.xpPerUnit, `XP per ${unit}`, 0, ACTIVITY_LIMITS.xpPerUnit);
  const maxUnits = session ? 1 : num(input.maxUnits, "Max amount", 0.001, ACTIVITY_LIMITS.maxUnits);
  const defaultUnits = session ? 1 : num(input.defaultUnits, "Tap amount", 0.001, ACTIVITY_LIMITS.maxUnits);
  if (defaultUnits > maxUnits) throw new Error("The tap amount can't be more than the max amount.");
  if (baseXp === 0 && xpPerUnit === 0) throw new Error("This activity would give 0 XP. Set base XP or XP per unit.");
  return { name, domain: input.domain, unit, baseXp, xpPerUnit, maxUnits, defaultUnits, quick: input.quick !== false };
}

/**
 * The database row for an edit. For a built-in activity, fields equal to
 * xp.json are stored as null so they keep following xp.json.
 */
export function overrideFields(clean: ActivityInput, base: Activity | undefined): Omit<ActivityOverride, "slug" | "hidden" | "position"> {
  const pick = <K extends (typeof FIELDS)[number]>(k: K) => (base && base[k] === clean[k] ? null : clean[k]);
  return {
    name: pick("name"),
    domain: clean.domain, // always stored, so the database can hide it when its domain is hidden from visitors
    unit: pick("unit"),
    baseXp: pick("baseXp"),
    xpPerUnit: pick("xpPerUnit"),
    maxUnits: pick("maxUnits"),
    defaultUnits: pick("defaultUnits"),
    quick: pick("quick"),
  };
}

/** A new slug from the name, e.g. "Play guitar" → "play-guitar" (or "play-guitar-2" if taken). */
export function slugFor(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "activity";
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** New positions after moving one activity up (-1) or down (+1). Returns every slug with its position. */
export function moveActivity(list: ReadonlyArray<GameActivity>, slug: string, dir: -1 | 1): { slug: string; position: number }[] {
  const order = list.map((a) => a.slug);
  const i = order.indexOf(slug);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order.map((s, position) => ({ slug: s, position }));
  [order[i], order[j]] = [order[j], order[i]];
  return order.map((s, position) => ({ slug: s, position }));
}
