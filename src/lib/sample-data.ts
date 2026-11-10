// Fake history for the preview page, scored with the real XP rules.
// Replaced by your real data once Supabase is connected.
import { gameConfig } from "./game/config";
import { type LogEntry, type Quest, type SheetData, toDay } from "./game/types";
import { newlyEarned } from "./game/achievements";
import type { LootItem, Purchase } from "./game/loot";
import type { Season, SeasonGoal } from "./game/seasons";
import type { Skill } from "./game/skills";
import { buildStats } from "./game/stats";
import { addDays } from "./game/streaks";
import { addToTotals, emptyTotals, repeatIndexFor, scoreEntry } from "./game/xp";

// Small seeded random generator, so the sample looks the same on every load.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Days ago with nothing logged: 3 = a planned rest day, 10 = saved by a shield, 26 + 27 = streak broken. */
const SAMPLE_GAPS = new Set([3, 10, 26, 27]);
const SAMPLE_REST_DAYS_AGO = 3;

export function buildSampleEntries(today: Date, days = 70): LogEntry[] {
  const rand = seeded(42);
  // How often each activity shows up on a given day.
  const habits: Record<string, number> = {
    run: 0.35, workout: 0.3, read: 0.6, study: 0.35, code: 0.7,
    practice: 0.3, call: 0.25, hangout: 0.15, meditate: 0.45, journal: 0.3,
  };
  const entries: LogEntry[] = [];
  for (let back = days; back >= 1; back--) {
    if (SAMPLE_GAPS.has(back)) continue; // days off, so the preview shows rest days, shields and a broken streak
    const date = new Date(today);
    date.setDate(today.getDate() - back);
    const day = toDay(date);
    for (const activity of gameConfig.activities) {
      if (rand() > (habits[activity.slug] ?? 0.2)) continue;
      const units = Math.max(1, Math.round(activity.defaultUnits * (0.6 + rand() * 0.8)));
      const difficulty = 2 + Math.floor(rand() * 3);
      const score = scoreEntry(activity, { units, difficulty, repeatIndex: repeatIndexFor(entries, activity.slug, day) });
      entries.push({
        id: `sample-${entries.length}`,
        activitySlug: activity.slug,
        domain: activity.domain,
        units,
        difficulty,
        xp: score.xp,
        gold: score.gold,
        occurredOn: day,
      });
    }
  }
  return entries;
}

export const sampleQuests: Quest[] = [
  {
    id: "q1", kind: "main", title: "Run a half marathon", domain: "body", xpReward: 500, goldReward: 100,
    objectives: [
      { id: "o1", title: "Run 5 km without stopping", done: true },
      { id: "o2", title: "Run 10 km", done: true },
      { id: "o3", title: "Run 15 km", done: false },
      { id: "o4", title: "Sign up for a race", done: false },
      { id: "o5", title: "Finish the race", done: false },
    ],
  },
  {
    id: "q2", kind: "side", title: "Cook 5 new recipes", domain: "craft", xpReward: 120, goldReward: 25,
    objectives: [
      { id: "o6", title: "Ramen from scratch", done: true },
      { id: "o7", title: "Shakshuka", done: true },
      { id: "o8", title: "Dumplings", done: false },
      { id: "o9", title: "Curry", done: false },
      { id: "o10", title: "Sourdough", done: false },
    ],
  },
  {
    id: "q3", kind: "main", title: "File this year's taxes", domain: "mind", xpReward: 300, goldReward: 80,
    isBoss: true, bossHp: 4,
    objectives: [
      { id: "o11", title: "Gather documents", done: true },
      { id: "o12", title: "Fill in the forms", done: false },
      { id: "o13", title: "Double-check", done: false },
      { id: "o14", title: "Submit", done: false },
    ],
  },
];

export const sampleDailies: Quest[] = [
  { id: "d1", kind: "daily", title: "Meditate 10 min", domain: "spirit", xpReward: 15, goldReward: 2, objectives: [] },
  { id: "d2", kind: "daily", title: "Read 10 pages", domain: "mind", xpReward: 15, goldReward: 2, objectives: [] },
  { id: "d3", kind: "daily", title: "No phone after 11pm", domain: "spirit", xpReward: 20, goldReward: 2, objectives: [] },
];

export const sampleSkills: Skill[] = [
  { id: "s1", tree: "Guitar", name: "Hold it right", requirement: "Tune it and hold it without looking it up", domain: "craft", parentId: null, xpReward: 40, unlockedAt: "2026-10-20T10:00:00Z" },
  { id: "s2", tree: "Guitar", name: "First chords", requirement: "Switch between G, C and D cleanly", domain: "craft", parentId: "s1", xpReward: 60, unlockedAt: "2026-10-30T10:00:00Z" },
  { id: "s3", tree: "Guitar", name: "Strumming", requirement: "Keep a steady down-up pattern for 2 minutes", domain: "craft", parentId: "s1", xpReward: 60, unlockedAt: null },
  { id: "s4", tree: "Guitar", name: "Barre chords", requirement: "Play F cleanly 10 times in a row", domain: "craft", parentId: "s2", xpReward: 120, unlockedAt: null },
  { id: "s5", tree: "Guitar", name: "First full song", requirement: "Play a whole song start to finish", domain: "craft", parentId: "s3", xpReward: 200, unlockedAt: null },
  { id: "s6", tree: "Cooking", name: "Knife basics", requirement: "Dice an onion evenly", domain: "craft", parentId: null, xpReward: 40, unlockedAt: null },
];

export const sampleLoot: LootItem[] = [
  { id: "l1", name: "Fancy coffee", description: "From the good place on the corner", cost: 30, repeatable: true },
  { id: "l2", name: "Movie night", description: null, cost: 80, repeatable: true },
  { id: "l3", name: "New headphones", description: "The ones I keep looking at", cost: 1500, repeatable: false },
];

export interface SampleWorld {
  sheet: SheetData;
  /** Raw counts the preview uses to judge achievements. */
  counts: { activityEntries: number; longestMinutes: number; questsCompleted: number; bossesDefeated: number; purchases: number };
}

/** The whole sample game for the preview page. */
export function buildSampleWorld(now: Date): SampleWorld {
  const entries = buildSampleEntries(now);
  const today = toDay(now);
  const xpByDay = new Map<string, number>();
  for (const e of entries) xpByDay.set(e.occurredOn, (xpByDay.get(e.occurredOn) ?? 0) + e.xp);
  const days = [...xpByDay].map(([day, xp]) => ({ day, xp }));
  const restDays = [addDays(today, -SAMPLE_REST_DAYS_AGO)];
  const totals = addToTotals(emptyTotals(), entries);
  const minuteSlugs = new Set(gameConfig.activities.filter((a) => a.unit === "minute").map((a) => a.slug));
  const purchases: Purchase[] = [{ id: "p1", itemId: "l1", cost: 30, purchasedAt: `${addDays(today, -2)}T09:00:00Z`, redeemedAt: null }];
  const counts = {
    activityEntries: entries.length,
    longestMinutes: Math.max(0, ...entries.filter((e) => e.activitySlug && minuteSlugs.has(e.activitySlug)).map((e) => e.units)),
    questsCompleted: 0,
    bossesDefeated: 0,
    purchases: purchases.length,
  };
  const seasons: Season[] = [
    { id: "season-past", name: "Summer warm-up", startsOn: addDays(today, -75), endsOn: addDays(today, -41), notes: "Get back into running and reading." },
    { id: "season-now", name: "Autumn arc", startsOn: addDays(today, -40), endsOn: addDays(today, 50), notes: "Half marathon, and finally deal with the taxes." },
  ];
  const closedSeasonGoals: SeasonGoal[] = [
    { id: "past-goal-1", title: "Run a 5k", seasonId: "season-past", status: "completed" },
    { id: "past-goal-2", title: "Read two books", seasonId: "season-past", status: "abandoned" },
  ];
  const completedOn = [addDays(today, -50)];
  const pinned = new Set(["q1", "q3"]);
  const quests = sampleQuests.map((q) => (pinned.has(q.id) ? { ...q, seasonId: "season-now" } : q));
  counts.questsCompleted = completedOn.length;
  const stats = buildStats({ days, restDays, today, totals, skills: sampleSkills, ...counts });
  // Sample achievements already earned, dated a few days back.
  const unlocked = Object.fromEntries(newlyEarned(stats, {}).map((slug, i) => [slug, `${addDays(today, -(i + 2))}T12:00:00Z`]));
  return {
    counts,
    sheet: {
      days,
      restDays,
      streaksReady: true,
      depthReady: true,
      theme: "crimson",
      displayName: "Player One",
      title: "Apprentice of many paths",
      bio: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      today,
      totals,
      recent: [...entries].reverse().slice(0, 10),
      todayCounts: {},
      quests,
      dailies: sampleDailies,
      skills: sampleSkills,
      shop: { items: sampleLoot, purchases },
      goldSpent: purchases.reduce((sum, p) => sum + p.cost, 0),
      achievements: { stats, unlocked },
      seasons,
      closedSeasonGoals,
      completedOn,
    },
  };
}
