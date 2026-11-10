"use server";

// Journal: your journey over a stretch of days. Works for you and for visitors:
// the database rules decide what each viewer may see.
import { isDay } from "@/lib/game/streaks";
import type { JournalData } from "@/lib/game/types";
import { dayInTimeZone } from "@/lib/game/xp";
import { type ActionResult, run } from "@/lib/server/action-helpers";
import { createAnonClient } from "@/lib/supabase/anon";
import { ENTRY_COLUMNS, type LogEntryRow, toLogEntry } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";

const MAX_DAYS = 400;

export async function loadJournalAction(fromDay: string, toDay: string, asVisitor = false): Promise<ActionResult<JournalData>> {
  return run(async () => {
    if (!isDay(fromDay) || !isDay(toDay) || toDay < fromDay) throw new Error("Bad date range.");
    if ((Date.parse(toDay) - Date.parse(fromDay)) / 86_400_000 > MAX_DAYS) throw new Error("Pick a shorter stretch of time.");
    const supabase = asVisitor ? createAnonClient() : await createClient();
    const { data: isOwner } = asVisitor ? { data: false } : await supabase.rpc("is_owner");
    const { data: profile } = await supabase.from("profile").select("*").maybeSingle<{ timezone: string; is_public: boolean; visibility?: Record<string, unknown> }>();
    if (!profile) throw new Error("This journal is private.");
    if (isOwner !== true && profile.visibility && profile.visibility.journal === false) throw new Error("This journal is private.");

    // Unlock times are instants; a day of margin covers every time zone, then they're sorted into local days.
    const lo = new Date(Date.parse(`${fromDay}T00:00:00Z`) - 86_400_000).toISOString();
    const hi = new Date(Date.parse(`${toDay}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const [entries, trophies, skills] = await Promise.all([
      supabase.from("log_entries").select(ENTRY_COLUMNS).gte("occurred_on", fromDay).lte("occurred_on", toDay).order("occurred_at", { ascending: false }).limit(1500),
      supabase.from("achievement_unlocks").select("slug, unlocked_at").gte("unlocked_at", lo).lt("unlocked_at", hi),
      supabase.from("skills").select("name, tree, unlocked_at").not("unlocked_at", "is", null).gte("unlocked_at", lo).lt("unlocked_at", hi),
    ]);
    if (entries.error) throw new Error(entries.error.message);
    const inRange = (day: string) => day >= fromDay && day <= toDay;
    const tz = profile.timezone;
    return {
      entries: ((entries.data ?? []) as LogEntryRow[]).map(toLogEntry),
      trophies: (trophies.data ?? [])
        .map((t) => ({ slug: t.slug as string, day: dayInTimeZone(new Date(t.unlocked_at as string), tz) }))
        .filter((t) => inRange(t.day)),
      skills: (skills.data ?? [])
        .map((s) => ({ name: s.name as string, tree: s.tree as string, day: dayInTimeZone(new Date(s.unlocked_at as string), tz) }))
        .filter((s) => inRange(s.day)),
    };
  });
}
