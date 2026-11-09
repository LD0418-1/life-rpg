// Database rows (snake_case) and how they turn into app objects (camelCase).
import type { LogEntry, Quest } from "@/lib/game/types";

export interface LogEntryRow {
  id: string;
  activity_slug: string | null;
  quest_id: string | null;
  domain: string;
  units: number | string | null;
  difficulty: number | null;
  note: string | null;
  xp: number;
  gold: number;
  occurred_on: string;
}

export interface ObjectiveRow {
  id: string;
  title: string;
  done_at: string | null;
  position: number;
}

export interface QuestRow {
  id: string;
  kind: "main" | "side" | "daily";
  title: string;
  domain: string | null;
  xp_reward: number;
  gold_reward: number;
  is_boss: boolean;
  quest_objectives?: ObjectiveRow[];
}

export interface ProfileRow {
  display_name: string;
  title: string | null;
  timezone: string;
  is_public: boolean;
}

export function toLogEntry(r: LogEntryRow): LogEntry {
  return {
    id: r.id,
    activitySlug: r.activity_slug,
    questId: r.quest_id,
    domain: r.domain,
    units: Number(r.units ?? 1),
    difficulty: r.difficulty ?? 3,
    xp: r.xp,
    gold: r.gold,
    occurredOn: r.occurred_on,
    note: r.note ?? undefined,
  };
}

export function toQuest(r: QuestRow, doneToday = false): Quest {
  const objectives = [...(r.quest_objectives ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ id: o.id, title: o.title, done: o.done_at !== null }));
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    domain: r.domain ?? "spirit",
    xpReward: r.xp_reward,
    goldReward: r.gold_reward,
    isBoss: r.is_boss,
    objectives,
    doneToday,
  };
}
