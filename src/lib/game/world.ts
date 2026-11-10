// The world map: one region per domain, whose buildings grow in stages as
// that domain levels up.
import { gameConfig } from "./config";
import { totalXpForLevel } from "./xp";

export interface Region {
  domain: string;
  name: string;
  tagline: string;
  /** One name per stage, matching STAGE_LEVELS. */
  stages: string[];
}

/** Domain level needed for each stage. */
export const STAGE_LEVELS = [1, 3, 5, 10, 15, 25];

export const REGIONS: Region[] = [
  {
    domain: "body",
    name: "Iron Peaks",
    tagline: "Mountains that answer to sweat.",
    stages: ["Base camp", "Lookout hut", "Stone keep", "Mountain fort", "Citadel", "Titan's summit"],
  },
  {
    domain: "mind",
    name: "Archive Spires",
    tagline: "Towers that grow with every page.",
    stages: ["Scattered scrolls", "Reading nook", "Library tower", "Twin spires", "Grand archive", "Observatory of everything"],
  },
  {
    domain: "craft",
    name: "Workshop Quarter",
    tagline: "Where things get made.",
    stages: ["Empty lot", "Tool shed", "Workshop", "Forge street", "Guild hall", "Master's foundry"],
  },
  {
    domain: "social",
    name: "Lantern Square",
    tagline: "Every friend lights a lantern.",
    stages: ["Lonely bench", "Tea stall", "Market square", "Lantern plaza", "Festival grounds", "City of a thousand lanterns"],
  },
  {
    domain: "spirit",
    name: "Still Lake",
    tagline: "Quiet water, steady mind.",
    stages: ["Misty shore", "Stone lantern", "Lake shrine", "Two-story pagoda", "Temple island", "Sky pagoda"],
  },
];

export function regionFor(domain: string): Region | undefined {
  return REGIONS.find((r) => r.domain === domain);
}

/** Stage index (0-5) for a domain level. */
export function stageFor(level: number): number {
  let stage = 0;
  STAGE_LEVELS.forEach((min, i) => {
    if (level >= min) stage = i;
  });
  return stage;
}

/** The next stage and how much domain XP it still needs, or null at the top. */
export function nextStage(region: Region, level: number, domainXp: number): { stage: number; name: string; level: number; xpToGo: number } | null {
  const next = stageFor(level) + 1;
  if (next >= STAGE_LEVELS.length) return null;
  const needLevel = STAGE_LEVELS[next];
  const xpToGo = Math.max(0, totalXpForLevel(needLevel, gameConfig.levels.domain) - domainXp);
  return { stage: next, name: region.stages[next], level: needLevel, xpToGo };
}

/** Upgrades built across the whole map (each region counts stages above the first). */
export function worldProgress(levels: Record<string, number>): { built: number; total: number } {
  const total = REGIONS.length * (STAGE_LEVELS.length - 1);
  const built = REGIONS.reduce((sum, r) => sum + stageFor(levels[r.domain] ?? 1), 0);
  return { built, total };
}
