import { type Activity, type GameConfig, gameConfig } from "./config";
import type { NewQuestInput, Quest } from "./types";

export const DEFAULT_QUEST_XP: Record<NewQuestInput["kind"], number> = { main: 300, side: 100, daily: 15 };
export const MAX_QUEST_XP = 5000;
export const MAX_OBJECTIVES = 30;
export const MAX_NOTE_LENGTH = 280;

export function cleanTitle(raw: string, what = "quest"): string {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) throw new Error(`Give the ${what} a title.`);
  if (title.length > 120) throw new Error("Keep titles under 120 characters.");
  return title;
}

/** A custom real-world reward for finishing a quest, e.g. "Buy new clothes". Empty means none. */
export function cleanReward(raw: string | null | undefined): string | null {
  const reward = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!reward) return null;
  if (reward.length > 120) throw new Error("Keep rewards under 120 characters.");
  return reward;
}

export function cleanXpReward(raw: number): number {
  const xp = Math.round(Number(raw));
  if (!Number.isFinite(xp) || xp < 0 || xp > MAX_QUEST_XP) throw new Error(`XP reward must be between 0 and ${MAX_QUEST_XP}.`);
  return xp;
}

export function goldForQuestXp(xp: number, config: GameConfig = gameConfig): number {
  return Math.round(xp * config.gold.perXp);
}

/** Cleans up and checks a new quest. Throws a readable error if something's wrong. */
export function normalizeNewQuest(input: NewQuestInput, config: GameConfig = gameConfig) {
  const title = cleanTitle(input.title);
  if (!["main", "side", "daily"].includes(input.kind)) throw new Error("Unknown quest type.");
  if (!config.domains.some((d) => d.id === input.domain)) throw new Error("Pick a domain.");
  const xpReward = cleanXpReward(input.xpReward);

  let objectives =
    input.kind === "daily" ? [] : input.objectives.map((o) => o.trim()).filter(Boolean).slice(0, MAX_OBJECTIVES);
  // No objectives: it's a one-step task, finished by ticking the task itself.
  if (input.kind !== "daily" && objectives.length === 0) objectives = [title];
  for (const o of objectives) cleanTitle(o, "objective");

  return {
    kind: input.kind,
    title,
    domain: input.domain,
    xpReward,
    goldReward: goldForQuestXp(xpReward, config),
    isBoss: input.kind !== "daily" && input.isBoss,
    objectives,
  };
}

/**
 * Can this objective be removed? Only open ones, and never the last open one:
 * that would leave a quest with everything ticked but no reward paid.
 */
export function checkRemoveObjective(quest: Pick<Quest, "objectives">, objectiveId: string): void {
  const target = quest.objectives.find((o) => o.id === objectiveId);
  if (!target) throw new Error("That objective no longer exists.");
  if (target.done) throw new Error("Finished objectives stay. They're part of your history.");
  const open = quest.objectives.filter((o) => !o.done).length;
  if (open <= 1) throw new Error("That's the last open objective. Tick it to finish the quest, or abandon the quest.");
}

export function checkAddObjective(quest: Pick<Quest, "objectives">): void {
  if (quest.objectives.length >= MAX_OBJECTIVES) throw new Error(`A quest can have at most ${MAX_OBJECTIVES} objectives.`);
}

/** Checks a custom log amount. Returns cleaned units (one decimal place). */
export function cleanUnits(activity: Activity, raw: number | undefined): number {
  if (raw === undefined) return activity.defaultUnits;
  const units = Math.round(Number(raw) * 10) / 10;
  if (!Number.isFinite(units) || units <= 0) throw new Error("Amount must be more than 0.");
  if (units > activity.maxUnits * 10) throw new Error(`${units} ${activity.unit}s seems too high. Typo?`);
  return units;
}

export function cleanNote(raw: string | undefined): string | null {
  const note = (raw ?? "").trim();
  if (!note) return null;
  if (note.length > MAX_NOTE_LENGTH) throw new Error(`Keep notes under ${MAX_NOTE_LENGTH} characters.`);
  return note;
}
