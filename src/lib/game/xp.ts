// The core game math. Every function here is "pure": same input, same output,
// no database or network. That makes it easy to test and easy to rebalance.
import { type Activity, type DomainId, type GameConfig, type LevelCurve, gameConfig } from "./config";

// ---------- Levels ----------

/** XP needed to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number, curve: LevelCurve): number {
  return Math.round(curve.base * Math.pow(level, curve.exponent));
}

/** Total XP needed to reach `level`, starting from level 1 with 0 XP. */
export function totalXpForLevel(level: number, curve: LevelCurve): number {
  let total = 0;
  for (let n = 1; n < level; n++) total += xpForNextLevel(n, curve);
  return total;
}

export interface LevelInfo {
  level: number;
  /** XP earned since reaching the current level. */
  xpIntoLevel: number;
  /** XP the current level takes in total (0 at max level). */
  xpForNext: number;
  /** 0 to 1, for progress bars. */
  progress: number;
  isMax: boolean;
}

export function levelFromXp(totalXp: number, curve: LevelCurve): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < curve.maxLevel) {
    const need = xpForNextLevel(level, curve);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  const isMax = level >= curve.maxLevel;
  const xpForNext = isMax ? 0 : xpForNextLevel(level, curve);
  return {
    level,
    xpIntoLevel: isMax ? 0 : remaining,
    xpForNext,
    progress: isMax ? 1 : remaining / xpForNext,
    isMax,
  };
}

// ---------- Scoring one log entry ----------

export interface EntryInput {
  /** How many units (minutes, pages...). Defaults to 1. Capped at activity.maxUnits. */
  units?: number;
  /** 1 (trivial) to 5 (brutal). Defaults to config.difficulty.default. */
  difficulty?: number;
  /** How many times this activity was already logged today (0 for the first time). */
  repeatIndex?: number;
}

export interface EntryScore {
  xp: number;
  gold: number;
  breakdown: {
    units: number;
    rawXp: number;
    difficultyMultiplier: number;
    repeatMultiplier: number;
  };
}

export function repeatMultiplier(repeatIndex: number, config: GameConfig = gameConfig): number {
  const { decayPerRepeat, floor } = config.diminishingReturns;
  return Math.max(floor, Math.pow(decayPerRepeat, Math.max(0, repeatIndex)));
}

export function difficultyMultiplier(difficulty: number | undefined, config: GameConfig = gameConfig): number {
  const key = String(difficulty ?? config.difficulty.default);
  const multiplier = config.difficulty.multipliers[key];
  if (multiplier === undefined) throw new Error(`Unknown difficulty "${key}"`);
  return multiplier;
}

export function scoreEntry(activity: Activity, input: EntryInput = {}, config: GameConfig = gameConfig): EntryScore {
  const units = Math.min(Math.max(input.units ?? 1, 0), activity.maxUnits);
  const rawXp = activity.baseXp + activity.xpPerUnit * units;
  const dMult = difficultyMultiplier(input.difficulty, config);
  const rMult = repeatMultiplier(input.repeatIndex ?? 0, config);
  const xp = Math.round(rawXp * dMult * rMult);
  return {
    xp,
    gold: Math.round(xp * config.gold.perXp),
    breakdown: { units, rawXp, difficultyMultiplier: dMult, repeatMultiplier: rMult },
  };
}

/** Counts earlier entries for the same activity on the same local day. */
export function repeatIndexFor(
  entries: ReadonlyArray<{ activitySlug: string | null; occurredOn: string }>,
  activitySlug: string,
  day: string,
): number {
  return entries.filter((e) => e.activitySlug === activitySlug && e.occurredOn === day).length;
}

// ---------- Summarizing many entries into a character ----------

export interface LedgerEntry {
  domain: DomainId;
  xp: number;
  gold: number;
}

export interface CharacterSummary {
  overall: LevelInfo & { totalXp: number };
  domains: Record<DomainId, LevelInfo & { totalXp: number }>;
  goldEarned: number;
}

export function summarize(entries: ReadonlyArray<LedgerEntry>, config: GameConfig = gameConfig): CharacterSummary {
  const xpByDomain: Record<DomainId, number> = Object.fromEntries(config.domains.map((d) => [d.id, 0]));
  let totalXp = 0;
  let goldEarned = 0;
  for (const e of entries) {
    if (!(e.domain in xpByDomain)) continue; // ignore domains removed from config
    xpByDomain[e.domain] += e.xp;
    totalXp += e.xp;
    goldEarned += e.gold;
  }
  const domains = Object.fromEntries(
    Object.entries(xpByDomain).map(([id, xp]) => [id, { ...levelFromXp(xp, config.levels.domain), totalXp: xp }]),
  );
  return {
    overall: { ...levelFromXp(totalXp, config.levels.overall), totalXp },
    domains,
    goldEarned,
  };
}
