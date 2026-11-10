// Loads src/config/xp.json, gives it TypeScript types, and checks it for
// mistakes. If you mistype a number or domain in the JSON, you get a clear
// error here instead of a mysterious bug somewhere else.
import rawConfig from "../../config/xp.json";

export type DomainId = string;

export interface Domain {
  id: DomainId;
  label: string;
  glyph: string;
}

export interface LevelCurve {
  base: number;
  exponent: number;
  maxLevel: number;
}

export interface Activity {
  slug: string;
  name: string;
  domain: DomainId;
  unit: string;
  baseXp: number;
  xpPerUnit: number;
  maxUnits: number;
  defaultUnits: number;
  quick: boolean;
}

export interface GameConfig {
  domains: Domain[];
  levels: { domain: LevelCurve; overall: LevelCurve };
  difficulty: {
    default: number;
    multipliers: Record<string, number>;
    labels: Record<string, string>;
  };
  diminishingReturns: { decayPerRepeat: number; floor: number };
  gold: { perXp: number };
  streak: {
    minXpPerDay: number;
    shieldEvery: number;
    maxShields: number;
    restDaysPerWeek: number;
    planAheadDays: number;
  };
  momentum: { gainPerActiveDay: number; missDecay: number; maxXpBonus: number };
  imports: {
    github: { activity: string; minutesPerCommit: number };
    health: Record<"steps" | "workout" | "run" | "mindful" | "sleep", string>;
  };
  activities: Activity[];
}

export function validateConfig(config: GameConfig): GameConfig {
  const errors: string[] = [];
  const domainIds = new Set(config.domains.map((d) => d.id));
  if (domainIds.size !== config.domains.length) errors.push("domain ids must be unique");

  for (const [name, curve] of Object.entries(config.levels)) {
    if (!(curve.base > 0)) errors.push(`levels.${name}.base must be > 0`);
    if (!(curve.exponent >= 1)) errors.push(`levels.${name}.exponent must be >= 1`);
    if (!(curve.maxLevel >= 2)) errors.push(`levels.${name}.maxLevel must be >= 2`);
  }

  if (!(String(config.difficulty.default) in config.difficulty.multipliers))
    errors.push("difficulty.default must be one of the difficulty.multipliers keys");

  const { decayPerRepeat, floor } = config.diminishingReturns;
  if (!(decayPerRepeat > 0 && decayPerRepeat <= 1)) errors.push("decayPerRepeat must be in (0, 1]");
  if (!(floor >= 0 && floor <= 1)) errors.push("diminishingReturns.floor must be in [0, 1]");

  const st = config.streak;
  if (!(st.minXpPerDay >= 1)) errors.push("streak.minXpPerDay must be >= 1");
  if (!(Number.isInteger(st.shieldEvery) && st.shieldEvery >= 1)) errors.push("streak.shieldEvery must be a whole number >= 1");
  if (!(Number.isInteger(st.maxShields) && st.maxShields >= 0)) errors.push("streak.maxShields must be a whole number >= 0");
  if (!(Number.isInteger(st.restDaysPerWeek) && st.restDaysPerWeek >= 0 && st.restDaysPerWeek <= 7))
    errors.push("streak.restDaysPerWeek must be a whole number from 0 to 7");
  if (!(Number.isInteger(st.planAheadDays) && st.planAheadDays >= 0)) errors.push("streak.planAheadDays must be a whole number >= 0");
  const mo = config.momentum;
  if (!(mo.gainPerActiveDay > 0 && mo.gainPerActiveDay <= 100)) errors.push("momentum.gainPerActiveDay must be in (0, 100]");
  if (!(mo.missDecay >= 0 && mo.missDecay <= 1)) errors.push("momentum.missDecay must be in [0, 1]");
  if (!(mo.maxXpBonus >= 0 && mo.maxXpBonus <= 1)) errors.push("momentum.maxXpBonus must be in [0, 1]");

  const slugs = new Set<string>();
  for (const a of config.activities) {
    if (slugs.has(a.slug)) errors.push(`duplicate activity slug "${a.slug}"`);
    slugs.add(a.slug);
    if (!domainIds.has(a.domain)) errors.push(`activity "${a.slug}" uses unknown domain "${a.domain}"`);
    if (a.baseXp < 0 || a.xpPerUnit < 0) errors.push(`activity "${a.slug}" has negative XP`);
    if (!(a.maxUnits > 0)) errors.push(`activity "${a.slug}" maxUnits must be > 0`);
  }

  const im = config.imports;
  const mapped = [im.github.activity, ...Object.values(im.health)];
  for (const slug of mapped) if (!slugs.has(slug)) errors.push(`imports refer to unknown activity "${slug}"`);
  if (!(im.github.minutesPerCommit > 0)) errors.push("imports.github.minutesPerCommit must be > 0");

  if (errors.length) throw new Error(`Invalid xp.json:\n- ${errors.join("\n- ")}`);
  return config;
}

export const gameConfig: GameConfig = validateConfig(rawConfig as GameConfig);

export function getActivity(slug: string, config: GameConfig = gameConfig): Activity {
  const activity = config.activities.find((a) => a.slug === slug);
  if (!activity) throw new Error(`Unknown activity "${slug}"`);
  return activity;
}
