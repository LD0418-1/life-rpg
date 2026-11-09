import { describe, expect, it } from "vitest";
import { type GameConfig, gameConfig, getActivity, validateConfig } from "./config";
import {
  levelFromXp,
  repeatIndexFor,
  repeatMultiplier,
  scoreEntry,
  summarize,
  totalXpForLevel,
  xpForNextLevel,
} from "./xp";

const curve = { base: 100, exponent: 1.5, maxLevel: 5 };

describe("level curve", () => {
  it("costs base XP to go from level 1 to 2, more after that", () => {
    expect(xpForNextLevel(1, curve)).toBe(100);
    expect(xpForNextLevel(2, curve)).toBe(283);
    expect(totalXpForLevel(3, curve)).toBe(383);
  });

  it("finds the level and progress for a given XP", () => {
    expect(levelFromXp(0, curve)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100, progress: 0 });
    expect(levelFromXp(99, curve).level).toBe(1);
    expect(levelFromXp(100, curve)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    expect(levelFromXp(383 + 50, curve)).toMatchObject({ level: 3, xpIntoLevel: 50 });
  });

  it("stops at max level", () => {
    expect(levelFromXp(1e9, curve)).toMatchObject({ level: 5, isMax: true, progress: 1 });
  });

  it("treats negative XP as zero", () => {
    expect(levelFromXp(-10, curve).level).toBe(1);
  });
});

describe("scoring an entry", () => {
  const run = getActivity("run"); // base 10, +1 per minute, max 120

  it("adds base XP and per-unit XP", () => {
    expect(scoreEntry(run, { units: 30 }).xp).toBe(40);
  });

  it("caps units so one huge entry can't inflate XP", () => {
    expect(scoreEntry(run, { units: 10_000 }).breakdown.units).toBe(120);
  });

  it("scales with difficulty", () => {
    expect(scoreEntry(run, { units: 30, difficulty: 5 }).xp).toBe(80);
    expect(scoreEntry(run, { units: 30, difficulty: 1 }).xp).toBe(20);
  });

  it("gives less XP for repeats on the same day, down to a floor", () => {
    expect(scoreEntry(run, { units: 30, repeatIndex: 1 }).xp).toBe(28);
    expect(repeatMultiplier(100)).toBe(gameConfig.diminishingReturns.floor);
  });

  it("pays gold from XP", () => {
    expect(scoreEntry(run, { units: 30 }).gold).toBe(4);
  });

  it("rejects unknown difficulty", () => {
    expect(() => scoreEntry(run, { difficulty: 9 })).toThrow(/difficulty/);
  });
});

describe("repeatIndexFor", () => {
  it("counts only the same activity on the same day", () => {
    const entries = [
      { activitySlug: "run", occurredOn: "2026-11-09" },
      { activitySlug: "run", occurredOn: "2026-11-08" },
      { activitySlug: "read", occurredOn: "2026-11-09" },
      { activitySlug: "run", occurredOn: "2026-11-09" },
    ];
    expect(repeatIndexFor(entries, "run", "2026-11-09")).toBe(2);
  });
});

describe("summarize", () => {
  it("levels each domain separately and totals overall XP", () => {
    const s = summarize([
      { domain: "body", xp: 150, gold: 15 },
      { domain: "mind", xp: 50, gold: 5 },
      { domain: "removed-domain", xp: 999, gold: 99 },
    ]);
    expect(s.domains.body).toMatchObject({ level: 2, totalXp: 150 });
    expect(s.domains.mind).toMatchObject({ level: 1, totalXp: 50 });
    expect(s.domains.craft.totalXp).toBe(0);
    expect(s.overall.totalXp).toBe(200);
    expect(s.goldEarned).toBe(20);
  });
});

describe("validateConfig", () => {
  it("accepts the real xp.json", () => {
    expect(() => validateConfig(gameConfig)).not.toThrow();
  });

  it("reports activities that point at a missing domain", () => {
    const broken: GameConfig = {
      ...gameConfig,
      activities: [{ ...gameConfig.activities[0], domain: "nope" }],
    };
    expect(() => validateConfig(broken)).toThrow(/unknown domain "nope"/);
  });
});
