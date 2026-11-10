// Shapes the app passes around. These mirror the tables in
// supabase/migrations/0001_init.sql (camelCase here, snake_case there).

import type { AchievementStats } from "./achievements";
import type { LootItem, NewLootInput, Purchase } from "./loot";
import type { NewSeasonInput, Season, SeasonEdit, SeasonGoal } from "./seasons";
import type { NewSkillInput, Skill } from "./skills";
import type { FinanceSettings, MoneyTx, NewTxInput } from "./finance";
import type { CalEvent } from "../calendar/ics";

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
  /** The season this quest is a goal of, if any. */
  seasonId?: string | null;
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
  /** Pin it as a goal of this season. */
  seasonId?: string | null;
  /** Your own real-world reward for finishing it, e.g. "Buy new clothes". */
  reward?: string;
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
  seasons: Season[];
  /** Season goals that are no longer active (completed or abandoned). Active ones are in `quests`. */
  closedSeasonGoals: SeasonGoal[];
  /** Days (YYYY-MM-DD) on which a main or side quest was completed. */
  completedOn: string[];
  /** Owner only: custom rewards by quest id. */
  rewards: Record<string, string>;
  /** False until the 0005 database script (rewards, wallet, calendar) has been run. */
  extrasReady: boolean;
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
  /** Custom reward; empty string removes it. Leave undefined to keep it as is. */
  reward?: string;
}

/** What finishing a daily or quest gave you. */
export interface QuestCompletion {
  entry: LogEntry | null;
  /** The custom reward added to your inventory, if the quest had one. */
  grant: Purchase | null;
}

export interface CalendarFeed {
  id: string;
  name: string;
  color: string;
  /** Just the host (e.g. calendar.google.com): the secret link never goes back to the browser. */
  host: string;
}

export interface CalendarData {
  feeds: CalendarFeed[];
  events: CalEvent[];
  /** Feeds that couldn't be loaded, with a readable reason. */
  errors: { feedId: string; message: string }[];
}

/** What the sheet calls when you do something. Preview = in memory, live = Supabase. */
export interface SheetBackend {
  logActivity(slug: string, options: LogOptions): Promise<LogEntry>;
  /** Deletes a logged activity (quest rewards can't be deleted). */
  deleteEntry(entryId: string): Promise<void>;
  completeDaily(questId: string): Promise<QuestCompletion>;
  setObjective(questId: string, objectiveId: string, done: boolean): Promise<QuestCompletion>;
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
  /** Marks an inventory item used; optionally logs what it cost in the wallet. */
  redeemPurchase(purchaseId: string, spent?: { amount: number; category: string }): Promise<{ purchase: Purchase; tx: MoneyTx | null }>;
  loadWallet(month: string): Promise<{ settings: FinanceSettings; txs: MoneyTx[] }>;
  addTx(input: NewTxInput): Promise<MoneyTx>;
  deleteTx(txId: string): Promise<void>;
  saveWalletSettings(settings: FinanceSettings): Promise<FinanceSettings>;
  /** Events between two days (inclusive), from your linked calendars. */
  loadCalendar(fromDay: string, toDay: string): Promise<CalendarData>;
  addFeed(input: { name: string; url: string; color: string }): Promise<CalendarFeed>;
  deleteFeed(feedId: string): Promise<void>;
  createSeason(input: NewSeasonInput): Promise<Season>;
  updateSeason(seasonId: string, edit: SeasonEdit): Promise<Season>;
  setQuestSeason(questId: string, seasonId: string | null): Promise<void>;
  /** Re-checks achievements after something happened. */
  syncAchievements(): Promise<AchievementSync>;
}
