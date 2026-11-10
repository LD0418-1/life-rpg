// Database rows (snake_case) and how they turn into app objects (camelCase).
import type { MoneyTx } from "@/lib/game/finance";
import type { Purchase } from "@/lib/game/loot";
import type { Season } from "@/lib/game/seasons";
import type { LogEntry, Quest } from "@/lib/game/types";

export interface LogEntryRow {
  id: string;
  source?: string;
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
  season_id?: string | null;
  quest_objectives?: ObjectiveRow[];
}

export interface ProfileRow {
  display_name: string;
  /** Missing until 0004_depth.sql has been run. */
  theme?: string;
  title: string | null;
  bio: string | null;
  timezone: string;
  is_public: boolean;
}

export const ENTRY_COLUMNS = "id, source, activity_slug, quest_id, domain, units, difficulty, note, xp, gold, occurred_on";

export const QUEST_COLUMNS =
  "id, kind, title, domain, xp_reward, gold_reward, is_boss, season_id, quest_objectives(id, title, done_at, position)";

export function toLogEntry(r: LogEntryRow): LogEntry {
  return {
    id: r.id,
    source: r.source,
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
    seasonId: r.season_id ?? null,
    objectives,
    doneToday,
  };
}

export const SEASON_COLUMNS = "id, name, starts_on, ends_on, notes";

export interface SeasonRow {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  notes: string | null;
}

export function toSeason(r: SeasonRow): Season {
  return { id: r.id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on, notes: r.notes };
}

/** Purchases are selected with "*" so this works before and after 0005 adds name/quest_id/source. */
export interface PurchaseRow {
  id: string;
  item_id: string | null;
  cost: number;
  purchased_at: string;
  redeemed_at: string | null;
  name?: string | null;
  quest_id?: string | null;
  source?: string | null;
}

export function toPurchase(p: PurchaseRow): Purchase {
  return {
    id: p.id,
    itemId: p.item_id,
    name: p.name ?? null,
    questId: p.quest_id ?? null,
    source: p.source === "quest" ? "quest" : "shop",
    cost: Number(p.cost),
    purchasedAt: p.purchased_at,
    redeemedAt: p.redeemed_at,
  };
}

export const TX_COLUMNS = "id, occurred_on, kind, amount, category, note, purchase_id";

export interface MoneyTxRow {
  id: string;
  occurred_on: string;
  kind: "expense" | "income";
  amount: number | string;
  category: string;
  note: string | null;
  purchase_id: string | null;
}

export function toMoneyTx(r: MoneyTxRow): MoneyTx {
  return { id: r.id, occurredOn: r.occurred_on, kind: r.kind, amount: Number(r.amount), category: r.category, note: r.note, purchaseId: r.purchase_id };
}
