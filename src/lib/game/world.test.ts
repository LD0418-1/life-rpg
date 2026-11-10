import { describe, expect, it } from "vitest";
import { type Season, normalizeNewSeason, normalizeSeasonEdit, rankFor, seasonState, seasonStats, suggestSeason } from "./seasons";
import { addDays } from "./streaks";
import { REGIONS, STAGE_LEVELS, nextStage, stageFor, worldProgress } from "./world";
import { gameConfig } from "./config";

describe("world map", () => {
  it("has a region with a name for every stage, for every domain", () => {
    expect(REGIONS.map((r) => r.domain).sort()).toEqual(gameConfig.domains.map((d) => d.id).sort());
    for (const r of REGIONS) expect(r.stages).toHaveLength(STAGE_LEVELS.length);
  });
  it("picks the stage for a level", () => {
    expect(stageFor(1)).toBe(0);
    expect(stageFor(2)).toBe(0);
    expect(stageFor(3)).toBe(1);
    expect(stageFor(9)).toBe(2);
    expect(stageFor(10)).toBe(3);
    expect(stageFor(99)).toBe(5);
  });
  it("says what's next and how far away it is", () => {
    const peaks = REGIONS[0];
    // domain curve: lv1->2 = 100, lv2->3 = 283, so level 3 needs 383 XP total
    expect(nextStage(peaks, 2, 300)).toEqual({ stage: 1, name: peaks.stages[1], level: 3, xpToGo: 83 });
    expect(nextStage(peaks, 30, 1e9)).toBeNull();
  });
  it("counts upgrades across the map", () => {
    expect(worldProgress({})).toEqual({ built: 0, total: 25 });
    expect(worldProgress({ body: 5, mind: 3, craft: 25 })).toEqual({ built: 2 + 1 + 5, total: 25 });
  });
});

describe("seasons", () => {
  const today = "2026-11-09";
  const autumn: Season = { id: "a", name: "Autumn", startsOn: "2026-10-01", endsOn: "2026-12-31", notes: null };
  const summer: Season = { id: "s", name: "Summer", startsOn: "2026-07-01", endsOn: "2026-09-30", notes: null };

  it("knows past, current and upcoming", () => {
    expect(seasonState(autumn, today)).toBe("current");
    expect(seasonState(summer, today)).toBe("past");
    expect(seasonState({ ...autumn, startsOn: "2026-12-01" }, today)).toBe("upcoming");
  });

  it("suggests the rest of this quarter, or the next one near the end", () => {
    expect(suggestSeason("2026-11-09")).toEqual({ name: "Q4 2026", startsOn: "2026-11-09", endsOn: "2026-12-31" });
    expect(suggestSeason("2026-12-15")).toEqual({ name: "Q1 2027", startsOn: "2026-12-15", endsOn: "2027-03-31" });
    expect(suggestSeason("2026-02-10").endsOn).toBe("2026-03-31");
  });

  it("validates new seasons", () => {
    const base = { name: "Winter arc", startsOn: "2027-01-01", endsOn: "2027-03-31", notes: "", questIds: ["q1", "q1"] };
    expect(normalizeNewSeason(base, [autumn], today)).toMatchObject({ name: "Winter arc", notes: null, questIds: ["q1"] });
    expect(() => normalizeNewSeason({ ...base, startsOn: "2026-12-01" }, [autumn], today)).toThrow(/overlap "Autumn"/);
    expect(() => normalizeNewSeason({ ...base, endsOn: "2026-12-31", startsOn: "2027-01-01" }, [], today)).toThrow(/end before/);
    expect(() => normalizeNewSeason({ ...base, startsOn: "2026-01-01", endsOn: "2026-02-01" }, [], today)).toThrow(/end today or later/);
    expect(() => normalizeNewSeason({ ...base, endsOn: "2028-06-01" }, [], today)).toThrow(/366/);
  });

  it("lets you end a current season today, not in the past, and freezes past ones", () => {
    expect(normalizeSeasonEdit(autumn, { name: "Autumn", endsOn: today, notes: "" }, [autumn], today).endsOn).toBe(today);
    expect(() => normalizeSeasonEdit(autumn, { name: "Autumn", endsOn: "2026-11-01", notes: "" }, [autumn], today)).toThrow(/past/);
    expect(() => normalizeSeasonEdit(summer, { name: "Summer", endsOn: "2026-10-15", notes: "" }, [summer], today)).toThrow(/history/);
    expect(normalizeSeasonEdit(summer, { name: "Hot summer", endsOn: summer.endsOn, notes: "fun" }, [summer], today)).toMatchObject({ name: "Hot summer", notes: "fun" });
  });

  it("ranks by the share of active days", () => {
    expect(rankFor(9, 10)).toBe("S");
    expect(rankFor(8, 10)).toBe("A");
    expect(rankFor(5, 10)).toBe("B");
    expect(rankFor(3, 10)).toBe("C");
    expect(rankFor(1, 10)).toBe("D");
    expect(rankFor(0, 0)).toBe("D");
  });

  it("calculates season stats from daily XP", () => {
    const s: Season = { id: "x", name: "Test", startsOn: "2026-11-01", endsOn: "2026-11-30", notes: null };
    const days = [
      { day: "2026-10-20", xp: 500 }, // before the season: counts toward the starting level only
      ...[0, 1, 2, 4, 5, 6, 7].map((i) => ({ day: addDays("2026-11-01", i), xp: 100 })),
    ];
    const st = seasonStats(s, days, "2026-11-09", ["2026-10-25", "2026-11-03"], [{ done: true }, { done: false }]);
    expect(st).toMatchObject({
      state: "current", totalDays: 30, elapsedDays: 9, dayNumber: 9, xp: 700, activeDays: 7, bestStreak: 4,
      questsCompleted: 1, goalsDone: 1, goalsTotal: 2,
    });
    expect(st.levelAtStart).toBe(2); // 500 XP: past 300 for level 2
    expect(st.levelNow).toBe(2); // 1200 XP: level 3 needs 1209
    // today (11-09) is quiet and not over, so 7 active of 8 judged days -> A
    expect(st.rank).toBe("A");
  });
});
