import type { AchievementStats } from "./achievements";
import { gameConfig } from "./config";
import { completedTrees, type Skill } from "./skills";
import { type DayXp, computeProgress } from "./streaks";
import { type DomainTotals, summarizeTotals } from "./xp";

export interface StatsInput {
  days: ReadonlyArray<DayXp>;
  restDays: ReadonlyArray<string>;
  today: string;
  totals: DomainTotals;
  skills: ReadonlyArray<Skill>;
  activityEntries: number;
  questsCompleted: number;
  bossesDefeated: number;
  purchases: number;
  longestMinutes: number;
}

/** Turns raw counts into the numbers achievements are judged on. */
export function buildStats(input: StatsInput): AchievementStats {
  const progress = computeProgress(input.days, input.restDays, input.today);
  const statuses = Object.entries(progress.statuses);
  const summary = summarizeTotals(input.totals);
  const domainLevels = gameConfig.domains.map((d) => summary.domains[d.id].level);
  return {
    activityEntries: input.activityEntries,
    activeDays: statuses.filter(([, s]) => s === "active").length,
    bestStreak: progress.bestStreak,
    shieldsUsed: statuses.filter(([, s]) => s === "shielded").length,
    restDaysTaken: statuses.filter(([day, s]) => s === "rest" && day < input.today).length,
    overallLevel: summary.overall.level,
    minDomainLevel: Math.min(...domainLevels),
    maxDomainLevel: Math.max(...domainLevels),
    questsCompleted: input.questsCompleted,
    bossesDefeated: input.bossesDefeated,
    skillsUnlocked: input.skills.filter((s) => s.unlockedAt).length,
    treesCompleted: completedTrees(input.skills),
    goldEarned: summary.goldEarned,
    purchases: input.purchases,
    longestMinutes: input.longestMinutes,
  };
}
