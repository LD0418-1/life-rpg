// Loot shop: real-world rewards you buy with gold.
import { cleanTitle } from "./quests";

export interface LootItem {
  id: string;
  name: string;
  description: string | null;
  cost: number;
  repeatable: boolean;
}

export interface Purchase {
  id: string;
  itemId: string;
  cost: number;
  purchasedAt: string;
  redeemedAt: string | null;
}

export interface NewLootInput {
  name: string;
  description: string;
  cost: number;
  repeatable: boolean;
}

export const MAX_LOOT_COST = 100_000;

export function normalizeNewLoot(input: NewLootInput) {
  const name = cleanTitle(input.name, "reward");
  const description = input.description.trim().slice(0, 200) || null;
  const cost = Math.round(Number(input.cost));
  if (!Number.isFinite(cost) || cost < 1 || cost > MAX_LOOT_COST) throw new Error(`Cost must be between 1 and ${MAX_LOOT_COST.toLocaleString()} gold.`);
  return { name, description, cost, repeatable: Boolean(input.repeatable) };
}

/** Why you can't buy this right now, or null if you can. */
export function buyBlocker(item: LootItem, balance: number, purchases: ReadonlyArray<Purchase>): string | null {
  if (!item.repeatable && purchases.some((p) => p.itemId === item.id)) return `"${item.name}" can only be bought once.`;
  if (balance < item.cost) return `Not enough gold: you have ${balance}, "${item.name}" costs ${item.cost}.`;
  return null;
}
