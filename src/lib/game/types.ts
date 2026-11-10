// Shapes the app passes around. These mirror the tables in
// supabase/migrations/0001_init.sql (camelCase here, snake_case there).

import type { AchievementStats } from "./achievements";
import type { LootItem, NewLootInput, Purchase } from "./loot";
import type { NewSeasonInput, Season, SeasonEdit, SeasonGoal } from "./seasons";
import type { NewSkillInput, Skill } from "./skills";
import type { FinanceSettings, MoneyTx, NewTxInput } from "./finance";
import type { CalEvent } from "../calendar/ics";
import type { ImportItem, ImportSource } from "../imports/core";
import type { Visibility } from "./visibility";
import type { ActivityInput, GameActivity } from "./activities";
import type { DiaryEntry, DiaryInput } from "./diary";
import type { WeekStats } from "./recap";
import type { MetricRow } from "../health/metrics";

export interface LogEntry {
  id: string;
  /** False = only you see it. */
  isPublic?: boolean;
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
  /** False = only you see it. */
  isPublic?: boolean;
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
  /** Owner only: imports waiting in the inbox. */
  pendingImports: number;
  /** What visitors may see. */
  visibility: Visibility;
  /** Every activity (xp.json + your changes), in quick-log order. Includes hidden ones. */
  activities: GameActivity[];
  /** False until the 0008 database script (activities, diary, recaps) has been run. */
  phase8Ready: boolean;
  /** Owner only: last week had XP but has no recap yet. */
  recapDue: boolean;
}

export interface WeeklyRecap {
  /** The Monday the week starts on. */
  weekStart: string;
  title: string;
  body: string;
  stats: WeekStats;
  /** "ai" = written by Claude, "basic" = the built-in template. */
  source: "ai" | "basic";
  isPublic: boolean;
  createdAt: string;
}

export interface RecapsData {
  ready: boolean;
  /** True when an Anthropic API key is set (owner only). */
  aiEnabled: boolean;
  /** Newest first. */
  recaps: WeeklyRecap[];
}

export interface HealthData {
  /** False until the 0009 database script (health metrics) has been run. */
  ready: boolean;
  /** One row per metric per day, oldest first. */
  metrics: MetricRow[];
  /** An iPhone Shortcut token exists. */
  connected: boolean;
  lastSyncedAt: string | null;
}

export interface DiaryData {
  ready: boolean;
  entries: DiaryEntry[];
}

/** One stretch of your journey for the Journal page. */
export interface JournalData {
  entries: LogEntry[];
  /** Achievements unlocked in the range, by local day. */
  trophies: { slug: string; day: string }[];
  /** Skills unlocked in the range, by local day. */
  skills: { name: string; tree: string; day: string }[];
  /** Diary notes in the range (visitors: only public ones). */
  notes: DiaryEntry[];
}

export interface ImportConnections {
  github: { username: string | null; lastSyncedAt: string | null; hasToken: boolean };
  health: { hasToken: boolean; lastSyncedAt: string | null };
}

export interface ImportsData {
  /** False until the 0006 database script (imports) has been run. */
  ready: boolean;
  pending: ImportItem[];
  /** The latest approved / ignored items. */
  recent: ImportItem[];
  connections: ImportConnections;
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
  loadImports(): Promise<ImportsData>;
  /** Fetches new activity from connected sources (or just one). */
  syncImports(source?: ImportSource): Promise<{ added: number; errors: string[] }>;
  approveImport(itemId: string): Promise<LogEntry>;
  ignoreImport(itemId: string): Promise<void>;
  restoreImport(itemId: string): Promise<void>;
  saveGithub(username: string | null): Promise<void>;
  disconnectImport(source: ImportSource): Promise<void>;
  /** Makes a new token for the iPhone Shortcut (shown once). */
  createHealthToken(): Promise<string>;
  setQuestPublic(questId: string, isPublic: boolean): Promise<void>;
  setEntryPublic(entryId: string, isPublic: boolean): Promise<void>;
  /** Your journey between two days (inclusive), as the current viewer may see it. */
  loadJournal(fromDay: string, toDay: string): Promise<JournalData>;
  createSeason(input: NewSeasonInput): Promise<Season>;
  updateSeason(seasonId: string, edit: SeasonEdit): Promise<Season>;
  setQuestSeason(questId: string, seasonId: string | null): Promise<void>;
  /** Re-checks achievements after something happened. */
  syncAchievements(): Promise<AchievementSync>;
  /** Adds (slug null) or edits a quick-log activity. Returns the new full list. */
  saveActivity(slug: string | null, input: ActivityInput): Promise<GameActivity[]>;
  setActivityHidden(slug: string, hidden: boolean): Promise<GameActivity[]>;
  /** Puts a built-in activity back to its xp.json values. */
  resetActivity(slug: string): Promise<GameActivity[]>;
  /** Deletes one of your own activities, or hides it if it has history. */
  deleteActivity(slug: string): Promise<{ activities: GameActivity[]; hiddenInstead: boolean }>;
  /** Saves the quick-log order (every slug, first to last). */
  reorderActivities(order: string[]): Promise<GameActivity[]>;
  /** A month (YYYY-MM) of diary entries, or a search across all of them. */
  loadDiary(query: { month?: string; search?: string }): Promise<DiaryData>;
  saveDiary(input: DiaryInput, entryId?: string): Promise<DiaryEntry>;
  deleteDiary(entryId: string): Promise<void>;
  setDiaryPublic(entryId: string, isPublic: boolean): Promise<void>;
  loadRecaps(): Promise<RecapsData>;
  /** Writes (or rewrites) the recap for the week starting on this Monday. */
  writeRecap(weekStart: string, options: { useDiary: boolean }): Promise<WeeklyRecap>;
  setRecapPublic(weekStart: string, isPublic: boolean): Promise<void>;
  /** Apple Health metrics between two days (inclusive). */
  loadHealth(fromDay: string, toDay: string): Promise<HealthData>;
}
