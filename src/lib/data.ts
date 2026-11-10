import "server-only";
import type { SheetData } from "@/lib/game/types";
import { type DomainTotals, dayInTimeZone, emptyTotals } from "@/lib/game/xp";
import {
  loadAchievementStats,
  loadGoldSpent,
  loadShop,
  loadSkills,
  loadUnlockedAchievements,
  recordAchievements,
} from "@/lib/supabase/depth-data";
import {
  ENTRY_COLUMNS,
  type LogEntryRow,
  type ProfileRow,
  QUEST_COLUMNS,
  type QuestRow,
  SEASON_COLUMNS,
  type SeasonRow,
  toLogEntry,
  toQuest,
  toSeason,
} from "@/lib/supabase/rows";
import type { SeasonGoal } from "@/lib/game/seasons";
import { createClient } from "@/lib/supabase/server";
import { loadStreakData } from "@/lib/supabase/streak-data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SheetResult =
  | { kind: "private"; signedIn: boolean }
  | { kind: "sheet"; sheet: SheetData; isOwner: boolean };

export async function loadTotals(supabase: Supabase): Promise<DomainTotals> {
  const res = await supabase.from("domain_totals").select("domain, xp, gold");
  if (res.error) throw new Error(`Could not load your totals: ${res.error.message}`);
  const totals = emptyTotals();
  for (const row of res.data ?? []) {
    if (row.domain in totals) totals[row.domain] = { xp: Number(row.xp), gold: Number(row.gold) };
  }
  return totals;
}

/** Loads the whole game state. Visitors only get what the security rules allow. */
export async function loadSheet(): Promise<SheetResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileRes, ownerRes] = await Promise.all([
    // "*" so this keeps working before 0004_depth.sql adds the theme column.
    supabase.from("profile").select("*").maybeSingle<ProfileRow>(),
    user ? supabase.rpc("is_owner") : Promise.resolve({ data: false, error: null }),
  ]);
  if (profileRes.error) throw new Error(`Could not load profile: ${profileRes.error.message}`);
  const isOwner = ownerRes.data === true;
  const profile = profileRes.data;
  if (!profile || (!isOwner && !profile.is_public)) return { kind: "private", signedIn: Boolean(user) };

  const today = dayInTimeZone(new Date(), profile.timezone);
  const [streakData, totals, recentRes, todayRes, questsRes, doneRes, skills, unlocked, shop, goldSpent, seasonsRes, closedGoalsRes, completedRes] =
    await Promise.all([
    loadStreakData(supabase),
    loadTotals(supabase),
    supabase.from("log_entries").select(ENTRY_COLUMNS).order("occurred_at", { ascending: false }).limit(10),
    supabase.from("log_entries").select("activity_slug").eq("occurred_on", today).not("activity_slug", "is", null),
    supabase.from("quests").select(QUEST_COLUMNS).eq("status", "active").order("position").order("created_at"),
    supabase.from("daily_completions").select("quest_id").eq("day", today),
    loadSkills(supabase),
    loadUnlockedAchievements(supabase),
    isOwner ? loadShop(supabase) : Promise.resolve(null),
    isOwner ? loadGoldSpent(supabase) : Promise.resolve(0),
    supabase.from("seasons").select(SEASON_COLUMNS).order("starts_on"),
    supabase.from("quests").select("id, title, season_id, status").not("season_id", "is", null).neq("status", "active"),
    supabase.from("quests").select("completed_at").eq("status", "completed").neq("kind", "daily"),
  ]);
  for (const res of [recentRes, todayRes, questsRes, doneRes, seasonsRes, closedGoalsRes, completedRes]) {
    if (res.error) throw new Error(`Could not load your data: ${res.error.message}`);
  }

  // Achievements: the owner's page load also records anything newly earned.
  const stats = await loadAchievementStats(supabase, { today, totals, streak: streakData, skills });
  const achievements = isOwner ? await recordAchievements(supabase, stats, unlocked) : { unlocked };

  const todayCounts: Record<string, number> = {};
  for (const row of todayRes.data ?? []) {
    if (row.activity_slug) todayCounts[row.activity_slug] = (todayCounts[row.activity_slug] ?? 0) + 1;
  }
  const doneToday = new Set((doneRes.data ?? []).map((r) => r.quest_id as string));
  const questRows = (questsRes.data ?? []) as QuestRow[];

  return {
    kind: "sheet",
    isOwner,
    sheet: {
      displayName: profile.display_name,
      title: profile.title,
      bio: profile.bio,
      timezone: profile.timezone,
      today,
      totals,
      recent: ((recentRes.data ?? []) as LogEntryRow[]).map(toLogEntry),
      todayCounts,
      quests: questRows.filter((q) => q.kind !== "daily").map((q) => toQuest(q)),
      dailies: questRows.filter((q) => q.kind === "daily").map((q) => toQuest(q, doneToday.has(q.id))),
      days: streakData.days,
      restDays: streakData.restDays,
      streaksReady: streakData.ready,
      depthReady: typeof profile.theme === "string",
      theme: profile.theme ?? "crimson",
      skills,
      shop,
      goldSpent,
      achievements: { stats, unlocked: achievements.unlocked },
      seasons: ((seasonsRes.data ?? []) as SeasonRow[]).map(toSeason),
      closedSeasonGoals: (closedGoalsRes.data ?? []).map(
        (q): SeasonGoal => ({ id: q.id as string, title: q.title as string, seasonId: q.season_id as string, status: q.status as SeasonGoal["status"] }),
      ),
      completedOn: (completedRes.data ?? [])
        .filter((q) => q.completed_at)
        .map((q) => dayInTimeZone(new Date(q.completed_at as string), profile.timezone)),
    },
  };
}
