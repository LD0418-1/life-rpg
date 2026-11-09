import { type GameConfig, gameConfig } from "./config";
import type { NewQuestInput } from "./types";

export const DEFAULT_QUEST_XP: Record<NewQuestInput["kind"], number> = { main: 300, side: 100, daily: 15 };
export const MAX_QUEST_XP = 5000;

/** Cleans up and checks a new quest. Throws a readable error if something's wrong. */
export function normalizeNewQuest(input: NewQuestInput, config: GameConfig = gameConfig) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the quest a title.");
  if (title.length > 120) throw new Error("Keep the title under 120 characters.");
  if (!["main", "side", "daily"].includes(input.kind)) throw new Error("Unknown quest type.");
  if (!config.domains.some((d) => d.id === input.domain)) throw new Error("Pick a domain.");

  const xpReward = Math.round(Number(input.xpReward));
  if (!Number.isFinite(xpReward) || xpReward < 0 || xpReward > MAX_QUEST_XP)
    throw new Error(`XP reward must be between 0 and ${MAX_QUEST_XP}.`);

  const objectives = input.kind === "daily" ? [] : input.objectives.map((o) => o.trim()).filter(Boolean).slice(0, 30);
  if (input.kind !== "daily" && objectives.length === 0) throw new Error("Add at least one objective (one per line).");

  return {
    kind: input.kind,
    title,
    domain: input.domain,
    xpReward,
    goldReward: Math.round(xpReward * config.gold.perXp),
    isBoss: input.kind !== "daily" && input.isBoss,
    objectives,
  };
}
