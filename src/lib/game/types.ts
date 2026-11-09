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
