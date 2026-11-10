"use server";

// Weekly recaps: written by Claude when ANTHROPIC_API_KEY is set, otherwise by
// a built-in template. Saved in weekly_recaps, private until you unlock one.
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { basicRecap, buildWeekStats, parseRecap, recapPrompt } from "@/lib/game/recap";
import { addDays, isDay, weekday } from "@/lib/game/streaks";
import type { RecapsData, WeeklyRecap } from "@/lib/game/types";
import { dayInTimeZone } from "@/lib/game/xp";
import { loadTotals } from "@/lib/data";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { aiConfigured, writeRecapWithClaude } from "@/lib/server/recap-ai";
import { createAnonClient } from "@/lib/supabase/anon";
import { DIARY_COLUMNS, type DiaryRow, NEEDS_0008, RECAP_COLUMNS, type RecapRow, loadActivities, toDiaryEntry, toRecap } from "@/lib/supabase/phase8-data";
import { ENTRY_COLUMNS, type LogEntryRow, SEASON_COLUMNS, type SeasonRow, toLogEntry, toSeason } from "@/lib/supabase/rows";
import { createClient } from "@/lib/supabase/server";
import { isMissingRelation, loadStreakData } from "@/lib/supabase/streak-data";

export async function loadRecapsAction(asVisitor = false): Promise<ActionResult<RecapsData>> {
  return run(async () => {
    const supabase = asVisitor ? createAnonClient() : await createClient();
    const { data: isOwner } = asVisitor ? { data: false } : await supabase.rpc("is_owner");
    // Visitors only get public recaps, and only when the journal is visible (database rules).
    const { data, error } = await supabase.from("weekly_recaps").select(RECAP_COLUMNS).order("week_start", { ascending: false }).limit(104);
    if (error) {
      if (isMissingRelation(error)) return { ready: false, aiEnabled: false, recaps: [] };
      throw new Error(error.message);
    }
    return { ready: true, aiEnabled: isOwner === true && aiConfigured(), recaps: ((data ?? []) as RecapRow[]).map(toRecap) };
  });
}

export async function writeRecapAction(weekStart: string, options: { useDiary: boolean }): Promise<ActionResult<WeeklyRecap>> {
  return run(async () => {
    const { supabase, today, timezone } = await ownerContext();
    if (!isDay(weekStart) || weekday(weekStart) !== 0) throw new Error("A week starts on a Monday.");
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd > today) throw new Error("This week isn't over yet. Its recap can be written from Sunday.");

    // Unlock times are instants: a day of margin either side, then sorted into local days.
    const lo = new Date(Date.parse(`${weekStart}T00:00:00Z`) - 86_400_000).toISOString();
    const hi = new Date(Date.parse(`${weekEnd}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const [profile, entriesRes, totals, streak, { activities }, trophiesRes, skillsRes, seasonsRes, goalsRes, notesRes] = await Promise.all([
      supabase.from("profile").select("display_name").single(),
      supabase.from("log_entries").select(ENTRY_COLUMNS).gte("occurred_on", addDays(weekStart, -7)).order("occurred_at").limit(5000),
      loadTotals(supabase),
      loadStreakData(supabase),
      loadActivities(supabase),
      supabase.from("achievement_unlocks").select("slug, unlocked_at").gte("unlocked_at", lo).lt("unlocked_at", hi),
      supabase.from("skills").select("name, unlocked_at").not("unlocked_at", "is", null).gte("unlocked_at", lo).lt("unlocked_at", hi),
      supabase.from("seasons").select(SEASON_COLUMNS),
      supabase.from("quests").select("id, title, season_id, status, completed_at").not("season_id", "is", null),
      supabase.from("diary_entries").select(DIARY_COLUMNS).gte("day", weekStart).lte("day", weekEnd).order("day"),
    ]);
    if (notesRes.error && isMissingRelation(notesRes.error)) throw new Error(NEEDS_0008);
    for (const res of [entriesRes, trophiesRes, skillsRes, seasonsRes, goalsRes, notesRes]) if (res.error) throw new Error(res.error.message);

    const entries = ((entriesRes.data ?? []) as LogEntryRow[]).map(toLogEntry);
    const questIds = [...new Set(entries.filter((e) => e.questId && e.occurredOn >= weekStart && e.occurredOn <= weekEnd).map((e) => e.questId!))];
    const questsRes = questIds.length ? await supabase.from("quests").select("id, kind, is_boss").in("id", questIds) : { data: [], error: null };
    if (questsRes.error) throw new Error(questsRes.error.message);

    const local = (instant: string) => dayInTimeZone(new Date(instant), timezone);
    const notes = ((notesRes.data ?? []) as DiaryRow[]).map(toDiaryEntry);
    const stats = buildWeekStats({
      weekStart,
      today,
      entries,
      totals,
      days: streak.days,
      restDays: streak.restDays,
      activities,
      quests: Object.fromEntries((questsRes.data ?? []).map((q) => [q.id as string, { kind: q.kind as string, isBoss: Boolean(q.is_boss) }])),
      trophies: (trophiesRes.data ?? []).map((t) => ({ name: ACHIEVEMENTS.find((a) => a.slug === t.slug)?.name ?? (t.slug as string), day: local(t.unlocked_at as string) })),
      skills: (skillsRes.data ?? []).map((s) => ({ name: s.name as string, day: local(s.unlocked_at as string) })),
      seasons: ((seasonsRes.data ?? []) as SeasonRow[]).map(toSeason),
      seasonGoals: (goalsRes.data ?? []).map((q) => ({
        seasonId: q.season_id as string,
        title: q.title as string,
        doneOn: q.status === "completed" && q.completed_at ? local(q.completed_at as string) : null,
      })),
      diaryEntries: notes.length,
    });

    let written: { title: string; body: string };
    let source: WeeklyRecap["source"] = "basic";
    if (aiConfigured()) {
      const prompt = recapPrompt(stats, options.useDiary ? notes : [], profile.data?.display_name ?? "Player");
      written = parseRecap(await writeRecapWithClaude(prompt));
      source = "ai";
    } else {
      written = basicRecap(stats);
    }

    // A rewrite keeps the recap's public / private setting.
    const { data, error } = await supabase
      .from("weekly_recaps")
      .upsert({ week_start: weekStart, title: written.title, body: written.body, stats, source, created_at: new Date().toISOString() }, { onConflict: "week_start" })
      .select(RECAP_COLUMNS)
      .single<RecapRow>();
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0008 : error.message);
    return toRecap(data);
  });
}

export async function setRecapPublicAction(weekStart: string, isPublic: boolean): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("weekly_recaps").update({ is_public: isPublic === true }).eq("week_start", weekStart).select("week_start");
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0008 : error.message);
    if (!data?.length) throw new Error("That recap no longer exists. Refresh the page.");
  });
}
