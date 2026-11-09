import { describe, expect, it } from "vitest";
import { type GameConfig, gameConfig } from "./config";
import { addDays, checkPlanRest, checkUnplanRest, computeProgress, isDay, weekStart, weekday } from "./streaks";

// Rules used by these tests (pinned so tuning xp.json doesn't break them).
const config: GameConfig = {
  ...gameConfig,
  streak: { minXpPerDay: 1, shieldEvery: 7, maxShields: 3, restDaysPerWeek: 1, planAheadDays: 14 },
  momentum: { gainPerActiveDay: 10, missDecay: 0.15, maxXpBonus: 0.2 },
};

const START = "2026-11-02"; // a Monday
/** Builds history from a pattern like "AAAA.AA" (A = active, . = nothing) starting at START. */
function history(pattern: string, start = START) {
  const days = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === "A") days.push({ day: addDays(start, i), xp: 30 });
  return days;
}
const dayN = (n: number) => addDays(START, n);

describe("day helpers", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("finds weekdays and week starts (Monday)", () => {
    expect(weekday("2026-11-02")).toBe(0);
    expect(weekday("2026-11-08")).toBe(6);
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
  it("validates dates", () => {
    expect(isDay("2026-11-09")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("11/09/2026")).toBe(false);
  });
});

describe("streaks", () => {
  it("is zero with no history", () => {
    const p = computeProgress([], [], START, config);
    expect(p).toMatchObject({ streak: 0, shields: 0, momentum: 0, todayStatus: "pending", ifMissedToday: "nothing" });
  });

  it("counts consecutive active days, including today", () => {
    expect(computeProgress(history("AAAA"), [], dayN(3), config).streak).toBe(4);
  });

  it("doesn't punish today before it's over", () => {
    const p = computeProgress(history("AAA"), [], dayN(3), config);
    expect(p).toMatchObject({ streak: 3, todayStatus: "pending", ifMissedToday: "break" });
    expect(p.statuses[dayN(3)]).toBe("pending");
  });

  it("resets after a missed day with no shield", () => {
    const p = computeProgress(history("AAA.A"), [], dayN(4), config);
    expect(p.streak).toBe(1);
    expect(p.bestStreak).toBe(3);
    expect(p.statuses[dayN(3)]).toBe("missed");
  });

  it("earns a shield every 7 days and spends it on a missed day", () => {
    const p = computeProgress(history("AAAAAAA.A"), [], dayN(8), config);
    expect(p.statuses[dayN(7)]).toBe("shielded");
    expect(p).toMatchObject({ streak: 8, shields: 0 });
  });

  it("caps shields", () => {
    const p = computeProgress(history("A".repeat(40)), [], dayN(39), config);
    expect(p.shields).toBe(3);
  });

  it("tells you a shield would cover today", () => {
    const p = computeProgress(history("AAAAAAA"), [], dayN(7), config);
    expect(p).toMatchObject({ shields: 1, ifMissedToday: "shield" });
  });

  it("keeps the streak on a planned rest day without counting it", () => {
    const p = computeProgress(history("AAA.A"), [dayN(3)], dayN(4), config);
    expect(p.streak).toBe(4);
    expect(p.statuses[dayN(3)]).toBe("rest");
  });

  it("counts a rest day you were active on as active", () => {
    const p = computeProgress(history("AAAA"), [dayN(3)], dayN(3), config);
    expect(p).toMatchObject({ streak: 4, todayStatus: "active" });
  });

  it("marks a rest day today as safe", () => {
    const p = computeProgress(history("AAA"), [dayN(3)], dayN(3), config);
    expect(p).toMatchObject({ streak: 3, todayStatus: "rest", ifMissedToday: "nothing" });
  });

  it("shows future rest days as planned", () => {
    expect(computeProgress(history("A"), [dayN(5)], dayN(0), config).statuses[dayN(5)]).toBe("planned-rest");
  });

  it("counts rest days left this week", () => {
    expect(computeProgress(history("A"), [], dayN(0), config).restLeftThisWeek).toBe(1);
    expect(computeProgress(history("A"), [dayN(2)], dayN(0), config).restLeftThisWeek).toBe(0);
    expect(computeProgress(history("A"), [dayN(9)], dayN(0), config).restLeftThisWeek).toBe(1); // next week
  });
});

describe("momentum", () => {
  it("grows 10 per active day up to 100", () => {
    expect(computeProgress(history("AAA"), [], dayN(2), config).momentum).toBe(30);
    expect(computeProgress(history("A".repeat(15)), [], dayN(14), config).momentum).toBe(100);
  });

  it("loses 15% per missed day, even when a shield saves the streak", () => {
    // 10 active days -> 100, then a shielded miss -> 85
    expect(computeProgress(history("AAAAAAAAAA."), [], dayN(11), config).momentum).toBe(85);
  });

  it("isn't changed by rest days", () => {
    expect(computeProgress(history("AAA.."), [dayN(3)], dayN(4), config).momentum).toBe(30);
  });

  it("boosts today's XP based on momentum at the start of today", () => {
    const p = computeProgress(history("AAAAA"), [], dayN(4), config); // 40 before today, 50 after
    expect(p.momentumAtDayStart).toBe(40);
    expect(p.momentum).toBe(50);
    expect(p.xpMultiplier).toBeCloseTo(1.08);
  });

  it("decays slowly across a long break instead of crashing to zero", () => {
    const p = computeProgress(history("AAAAAAAAAA" + ".".repeat(7) + "A"), [], dayN(17), config);
    // 100 * 0.85^7 ≈ 32.06, then +10 today
    expect(p.momentum).toBeCloseTo(42.1, 1);
  });
});

describe("planning rest days", () => {
  const today = dayN(0); // Monday
  it("allows today (if not active yet) and future days in the window", () => {
    expect(() => checkPlanRest(today, today, [], 0, config)).not.toThrow();
    expect(() => checkPlanRest(dayN(14), today, [], 0, config)).not.toThrow();
  });
  it("rejects past days, days too far ahead, and duplicates", () => {
    expect(() => checkPlanRest(addDays(today, -1), today, [], 0, config)).toThrow(/after the fact/);
    expect(() => checkPlanRest(dayN(15), today, [], 0, config)).toThrow(/14 days/);
    expect(() => checkPlanRest(dayN(2), today, [dayN(2)], 0, config)).toThrow(/already/);
  });
  it("rejects today if you've already been active", () => {
    expect(() => checkPlanRest(today, today, [], 40, config)).toThrow(/already been active/);
  });
  it("limits rest days per Monday-Sunday week", () => {
    expect(() => checkPlanRest(dayN(3), today, [dayN(1)], 0, config)).toThrow(/per week/);
    expect(() => checkPlanRest(dayN(7), today, [dayN(1)], 0, config)).not.toThrow(); // next Monday
  });
  it("only lets you cancel today's or future rest days", () => {
    expect(() => checkUnplanRest(dayN(2), today, [dayN(2)])).not.toThrow();
    expect(() => checkUnplanRest(addDays(today, -1), today, [addDays(today, -1)])).toThrow(/history/);
  });
});

describe("momentum XP bonus in scoring", () => {
  it("applies and caps the multiplier", async () => {
    const { scoreEntry } = await import("./xp");
    const { getActivity } = await import("./config");
    const run = getActivity("run");
    expect(scoreEntry(run, { units: 30, momentumMultiplier: 1.2 }).xp).toBe(48);
    expect(scoreEntry(run, { units: 30, momentumMultiplier: 5 }).breakdown.momentumMultiplier).toBeCloseTo(1 + gameConfig.momentum.maxXpBonus);
    expect(scoreEntry(run, { units: 30 }).xp).toBe(40);
  });
});
