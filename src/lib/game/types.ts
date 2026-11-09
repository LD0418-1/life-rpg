// Shapes the app passes around. These mirror the tables in
// supabase/migrations/0001_init.sql (camelCase here, snake_case there).

import type { AchievementStats } from "./achievements";
import type { LootItem, NewLootInput, Purchase } from "./loot";
import type { NewSkillInput, Skill } from "./skills";

export interface LogEntry {
  id: string;
  /** manual, quest, skill, ... */
  source?: string;
  activitySlug: string | null;
  questId?: string | null;
  domain: string;
  units: number;
  difficulty: number;
  xp: number;
  gold: number;
  /** Local day, YYYY-MM-DD. Used for diminishing returns and streaks. */
  occurredOn: string;
  note?: string;
}

export interface QuestObjective {
  id: string;
  title: string;
  done: boolean;
}

export interface Quest {
  id: string;
  kind: "main" | "side" | "daily";
  title: string;
  domain: string;
  xpReward: number;
  goldReward: number;
  isBoss?: boolean;
  bossHp?: number;
  objectives: QuestObjective[];
  completed?: boolean;
  /** For dailies: done today? */
  doneToday?: boolean;
}

/** Local calendar day as YYYY-MM-DD. */
export function toDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface NewQuestInput {
  kind: "main" | "side" | "daily";
  title: string;
  domain: string;
  xpReward: number;
  isBoss: boolean;
  objectives: string[];
}

/** Everything the character sheet shows. Loaded from Supabase, or built from sample data. */
export interface SheetData {
  displayName: string;
  title: string | null;
  bio: string | null;
  timezone: string;
  /** Today's date (YYYY-MM-DD) in the profile's time zone. */
  today: string;
  totals: Record<string, { xp: number; gold: number }>;
  /** Newest first. */
  recent: LogEntry[];
  /** How many times each activity was logged today (for diminishing returns). */
  todayCounts: Record<string, number>;
  quests: Quest[];
  dailies: Quest[];
  /** XP per day, for streaks and momentum. */
  days: { day: string; xp: number }[];
  /** Planned rest days (YYYY-MM-DD). */
  restDays: string[];
  /** False until the 0003_streaks.sql database script has been run. */
  streaksReady: boolean;
  /** False until the 0004_depth.sql database script has been run. */
  depthReady: boolean;
  /** Accent theme id (see lib/game/themes.ts). */
  theme: string;
  skills: Skill[];
  /** Owner only: visitors never see the shop. */
  shop: { items: LootItem[]; purchases: Purchase[] } | null;
  goldSpent: number;
  achievements: { stats: AchievementStats; unlocked: Record<string, string> };
}

export interface AchievementSync {
  stats: AchievementStats;
  unlocked: Record<string, string>;
  /** Slugs unlocked by this sync, for the celebration. */
  newly: string[];
}

export interface LogOptions {
  difficulty: number;
  /** Defaults to the activity's defaultUnits. */
  units?: number;
  note?: string;
}

export interface QuestEdit {
  title: string;
  xpReward: number;
}

/** What the sheet calls when you do something. Preview = in memory, live = Supabase. */
export interface SheetBackend {
  logActivity(slug: string, options: LogOptions): Promise<LogEntry>;
  /** Deletes a logged activity (quest rewards can't be deleted). */
  deleteEntry(entryId: string): Promise<void>;
  completeDaily(questId: string): Promise<LogEntry | null>;
  setObjective(questId: string, objectiveId: string, done: boolean): Promise<LogEntry | null>;
  createQuest(input: NewQuestInput): Promise<Quest>;
  updateQuest(questId: string, edit: QuestEdit): Promise<Quest>;
  addObjective(questId: string, title: string): Promise<Quest>;
  removeObjective(questId: string, objectiveId: string): Promise<Quest>;
  abandonQuest(questId: string): Promise<void>;
  planRest(day: string): Promise<void>;
  unplanRest(day: string): Promise<void>;
  createSkill(input: NewSkillInput): Promise<Skill>;
  deleteSkill(skillId: string): Promise<void>;
  unlockSkill(skillId: string): Promise<LogEntry>;
  createLoot(input: NewLootInput): Promise<LootItem>;
  archiveLoot(itemId: string): Promise<void>;
  buyLoot(itemId: string): Promise<Purchase>;
  redeemPurchase(purchaseId: string): Promise<Purchase>;
  /** Re-checks achievements after something happened. */
  syncAchievements(): Promise<AchievementSync>;
}
