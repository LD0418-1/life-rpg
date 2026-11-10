import "server-only";
// Reading the 0008 tables: your activities, diary entries and weekly recaps.
// Each loader works before 0008 has been run (it returns `ready: false`).
import { type ActivityOverride, type GameActivity, mergeActivities } from "@/lib/game/activities";
import type { DiaryEntry } from "@/lib/game/diary";
import type { WeekStats } from "@/lib/game/recap";
import type { WeeklyRecap } from "@/lib/game/types";
import type { createClient } from "./server";
import { isMissingRelation } from "./streak-data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const NEEDS_0008 = "This needs a one-time database update first: run supabase/migrations/0008_activities_diary_recaps.sql in the Supabase SQL Editor.";

// ---------- activities ----------

export const ACTIVITY_COLUMNS = "slug, name, domain, unit, base_xp, xp_per_unit, max_units, default_units, quick, hidden, position";

export interface ActivityRow {
  slug: string;
  name: string | null;
  domain: string | null;
  unit: string | null;
  base_xp: number | string | null;
  xp_per_unit: number | string | null;
  max_units: number | string | null;
  default_units: number | string | null;
  quick: boolean | null;
  hidden: boolean;
  position: number | null;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function toOverride(r: ActivityRow): ActivityOverride {
  return {
    slug: r.slug,
    name: r.name,
    domain: r.domain,
    unit: r.unit,
    baseXp: num(r.base_xp),
    xpPerUnit: num(r.xp_per_unit),
    maxUnits: num(r.max_units),
    defaultUnits: num(r.default_units),
    quick: r.quick,
    hidden: r.hidden,
    position: r.position,
  };
}

/** xp.json merged with your changes. Before 0008 it's just xp.json. */
export async function loadActivities(supabase: Supabase): Promise<{ ready: boolean; activities: GameActivity[] }> {
  const { data, error } = await supabase.from("activity_settings").select(ACTIVITY_COLUMNS);
  if (error) {
    if (isMissingRelation(error)) return { ready: false, activities: mergeActivities([]) };
    throw new Error(`Could not load your activities: ${error.message}`);
  }
  return { ready: true, activities: mergeActivities(((data ?? []) as ActivityRow[]).map(toOverride)) };
}

// ---------- diary ----------

export const DIARY_COLUMNS = "id, day, title, body, mood, is_public, created_at, updated_at";

export interface DiaryRow {
  id: string;
  day: string;
  title: string | null;
  body: string;
  mood: number | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export const toDiaryEntry = (r: DiaryRow): DiaryEntry => ({
  id: r.id,
  day: r.day,
  title: r.title,
  body: r.body,
  mood: r.mood,
  isPublic: r.is_public,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ---------- recaps ----------

export const RECAP_COLUMNS = "week_start, title, body, stats, source, is_public, created_at";

export interface RecapRow {
  week_start: string;
  title: string;
  body: string;
  stats: WeekStats;
  source: "ai" | "basic";
  is_public: boolean;
  created_at: string;
}

export const toRecap = (r: RecapRow): WeeklyRecap => ({
  weekStart: r.week_start,
  title: r.title,
  body: r.body,
  stats: r.stats,
  source: r.source,
  isPublic: r.is_public,
  createdAt: r.created_at,
});
