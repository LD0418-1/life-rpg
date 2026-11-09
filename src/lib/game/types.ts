// Shapes the app passes around. These mirror the tables in
// supabase/migrations/0001_init.sql (camelCase here, snake_case there).

export interface LogEntry {
  id: string;
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
}
