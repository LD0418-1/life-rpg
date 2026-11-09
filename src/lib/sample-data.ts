// Fake history for the preview page, scored with the real XP rules.
// Replaced by your real data once Supabase is connected.
import { gameConfig } from "./game/config";
import { type LogEntry, type Quest, type SheetData, toDay } from "./game/types";
import { addToTotals, emptyTotals, repeatIndexFor, scoreEntry } from "./game/xp";

// Small seeded random generator, so the sample looks the same on every load.
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildSampleEntries(today: Date, days = 40): LogEntry[] {
  const rand = seeded(42);
  // How often each activity shows up on a given day.
  const habits: Record<string, number> = {
    run: 0.35, workout: 0.3, read: 0.6, study: 0.35, code: 0.7,
    practice: 0.3, call: 0.25, hangout: 0.15, meditate: 0.45, journal: 0.3,
  };
  const entries: LogEntry[] = [];
  for (let back = days; back >= 1; back--) {
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

/** A full sample character sheet for the preview page. */
export function buildSampleSheet(now: Date): SheetData {
  const entries = buildSampleEntries(now);
  const today = toDay(now);
  return {
    displayName: "Player One",
    title: "Apprentice of many paths",
    bio: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    today,
    totals: addToTotals(emptyTotals(), entries),
    recent: [...entries].reverse().slice(0, 10),
    todayCounts: {},
    quests: sampleQuests,
    dailies: sampleDailies,
  };
}
