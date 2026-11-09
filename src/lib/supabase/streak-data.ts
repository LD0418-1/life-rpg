import "server-only";
import type { DayXp } from "@/lib/game/streaks";
import type { createClient } from "./server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** True when Supabase says a table or view doesn't exist (database script not run yet). */
export function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "")));
}

export type StreakData = { ready: true; days: DayXp[]; restDays: string[] } | { ready: false; days: []; restDays: [] };

/** Loads every day's XP and all rest days. Pages through results (Supabase returns at most 1000 rows per request). */
export async function loadStreakData(supabase: Supabase): Promise<StreakData> {
  const days: DayXp[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("daily_xp").select("day, xp").order("day").range(from, from + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return { ready: false, days: [], restDays: [] };
      throw new Error(`Could not load your streak: ${error.message}`);
    }
    for (const row of data ?? []) days.push({ day: row.day as string, xp: Number(row.xp) });
    if (!data || data.length < PAGE) break;
  }
  const { data: rest, error: restError } = await supabase.from("rest_days").select("day").order("day");
  if (restError) {
    if (isMissingRelation(restError)) return { ready: false, days: [], restDays: [] };
    throw new Error(`Could not load your rest days: ${restError.message}`);
  }
  return { ready: true, days, restDays: (rest ?? []).map((r) => r.day as string) };
}
