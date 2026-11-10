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
import { createAnonClient } from "@/lib/supabase/anon";
import { parseVisibility } from "@/lib/game/visibility";
import { isMissingRelation, loadStreakData } from "@/lib/supabase/streak-data";
import { loadActivities } from "@/lib/supabase/phase8-data";
import { lastFinishedWeek } from "@/lib/game/recap";
import { addDays } from "@/lib/game/streaks";

/** How many imports are waiting in the inbox (0 if imports aren't set up yet). */
async function countPendingImports(supabase: Supabase): Promise<number> {
  const { count, error } = await supabase.from("import_items").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? 0 : (count ?? 0);
}

/** Owner only: true when last week had XP but no recap was written yet. */
async function isRecapDue(supabase: Supabase, today: string, days: { day: string; xp: number }[]): Promise<boolean> {
  const monday = lastFinishedWeek(today);
  const sunday = addDays(monday, 6);
  if (!days.some((d) => d.day >= monday && d.day <= sunday && d.xp > 0)) return false;
  const { count, error } = await supabase.from("weekly_recaps").select("week_start", { count: "exact", head: true }).eq("week_start", monday);
  return !error && count === 0;
}

/** Custom quest rewards (owner only). `ready` is false until 0005 has been run. */
async function loadRewards(supabase: Supabase): Promise<{ ready: boolean; rewards: Record<string, string> }> {
  const { data, error } = await supabase.from("quest_rewards").select("quest_id, reward");
  if (error) {
    if (isMissingRelation(error)) return { ready: false, rewards: {} };
    throw new Error(`Could not load rewards: ${error.message}`);
  }
  return { ready: true, rewards: Object.fromEntries((data ?? []).map((r) => [r.quest_id as string, r.reward as string])) };
}

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

/**
 * Loads the whole game state. Visitors only get what the security rules allow.
 * `asVisitor` ignores your login, to preview exactly what visitors see.
 */
export async function loadSheet(options: { asVisitor?: boolean } = {}): Promise<SheetResult> {
  const supabase = options.asVisitor ? createAnonClient() : await createClient();
  const user = options.asVisitor ? null : (await supabase.auth.getUser()).data.user;

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
  const [streakData, totals, recentRes, todayRes, questsRes, doneRes, skills, unlocked, shop, goldSpent, seasonsRes, closedGoalsRes, completedRes, rewardData, pendingImports, activityData] =
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
    isOwner ? loadRewards(supabase) : Promise.resolve({ ready: true, rewards: {} }),
    isOwner ? countPendingImports(supabase) : Promise.resolve(0),
    loadActivities(supabase),
  ]);
  for (const res of [recentRes, todayRes, questsRes, doneRes, seasonsRes, closedGoalsRes, completedRes]) {
    if (res.error) throw new Error(`Could not load your data: ${res.error.message}`);
  }

  // Achievements: the owner's page load also records anything newly earned.
  const stats = await loadAchievementStats(supabase, { today, totals, streak: streakData, skills, activities: activityData.activities });
  const recapDue = isOwner && activityData.ready ? await isRecapDue(supabase, today, streakData.days) : false;
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
      rewards: rewardData.rewards,
      extrasReady: rewardData.ready,
      pendingImports,
      visibility: parseVisibility(profile.visibility),
      activities: activityData.activities,
      phase8Ready: activityData.ready,
      recapDue,
    },
  };
}
