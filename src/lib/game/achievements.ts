// Achievements: definitions + how far along you are. The server computes the
// stats from your database and records unlocks, so they can't be faked.

export interface AchievementStats {
  activityEntries: number;
  activeDays: number;
  bestStreak: number;
  shieldsUsed: number;
  restDaysTaken: number;
  overallLevel: number;
  minDomainLevel: number;
  maxDomainLevel: number;
  questsCompleted: number;
  bossesDefeated: number;
  skillsUnlocked: number;
  treesCompleted: number;
  goldEarned: number;
  purchases: number;
  longestMinutes: number;
}

export const EMPTY_STATS: AchievementStats = {
  activityEntries: 0, activeDays: 0, bestStreak: 0, shieldsUsed: 0, restDaysTaken: 0, overallLevel: 1,
  minDomainLevel: 1, maxDomainLevel: 1, questsCompleted: 0, bossesDefeated: 0, skillsUnlocked: 0,
  treesCompleted: 0, goldEarned: 0, purchases: 0, longestMinutes: 0,
};

export interface Achievement {
  slug: string;
  name: string;
  description: string;
  /** Hidden achievements show as "???" until unlocked. */
  hidden?: boolean;
  /** Which stat it tracks, and the target. */
  stat: keyof AchievementStats;
  target: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { slug: "first-step", name: "First step", description: "Log your first activity.", stat: "activityEntries", target: 1 },
  { slug: "week-warrior", name: "Week warrior", description: "Reach a 7-day streak.", stat: "bestStreak", target: 7 },
  { slug: "unbreakable", name: "Unbreakable", description: "Reach a 30-day streak.", stat: "bestStreak", target: 30 },
  { slug: "centurion", name: "Centurion", description: "Reach a 100-day streak.", stat: "bestStreak", target: 100 },
  { slug: "hundred-days", name: "Hundred days", description: "Be active on 100 different days.", stat: "activeDays", target: 100 },
  { slug: "level-5", name: "Getting started", description: "Reach level 5.", stat: "overallLevel", target: 5 },
  { slug: "level-10", name: "Seasoned", description: "Reach level 10.", stat: "overallLevel", target: 10 },
  { slug: "level-25", name: "Legend in the making", description: "Reach level 25.", stat: "overallLevel", target: 25 },
  { slug: "well-rounded", name: "Well-rounded", description: "Get every domain to level 3.", stat: "minDomainLevel", target: 3 },
  { slug: "specialist", name: "Specialist", description: "Get any domain to level 10.", stat: "maxDomainLevel", target: 10 },
  { slug: "questing", name: "Questing", description: "Complete a main or side quest.", stat: "questsCompleted", target: 1 },
  { slug: "quest-log-full", name: "Quest log full", description: "Complete 10 quests.", stat: "questsCompleted", target: 10 },
  { slug: "giant-slayer", name: "Giant slayer", description: "Defeat a boss.", stat: "bossesDefeated", target: 1 },
  { slug: "boss-rush", name: "Boss rush", description: "Defeat 5 bosses.", stat: "bossesDefeated", target: 5 },
  { slug: "skill-point", name: "Skill point spent", description: "Unlock your first skill.", stat: "skillsUnlocked", target: 1 },
  { slug: "mastery", name: "Mastery", description: "Unlock every skill in a tree of 3 or more.", stat: "treesCompleted", target: 1 },
  { slug: "treat-yourself", name: "Treat yourself", description: "Buy a reward in the loot shop.", stat: "purchases", target: 1 },
  { slug: "gold-hoarder", name: "Gold hoarder", description: "Earn 1,000 gold in total.", stat: "goldEarned", target: 1000 },
  { slug: "saved-by-the-shield", name: "Saved by the shield", description: "A shield saved your streak.", hidden: true, stat: "shieldsUsed", target: 1 },
  { slug: "strategic-rest", name: "Strategic rest", description: "Take a planned rest day.", hidden: true, stat: "restDaysTaken", target: 1 },
  { slug: "marathon-session", name: "Marathon session", description: "Log 120 minutes or more in one go.", hidden: true, stat: "longestMinutes", target: 120 },
];

export function isEarned(a: Achievement, stats: AchievementStats): boolean {
  return stats[a.stat] >= a.target;
}

/** Slugs earned by these stats that aren't recorded as unlocked yet. */
export function newlyEarned(stats: AchievementStats, unlocked: Record<string, string>): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.slug] && isEarned(a, stats)).map((a) => a.slug);
}

export function achievementProgress(a: Achievement, stats: AchievementStats): { current: number; target: number } {
  return { current: Math.min(stats[a.stat], a.target), target: a.target };
}
