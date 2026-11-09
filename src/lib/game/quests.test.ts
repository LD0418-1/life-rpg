import { describe, expect, it } from "vitest";
import { getActivity } from "./config";
import {
  checkAddObjective,
  checkRemoveObjective,
  cleanNote,
  cleanTitle,
  cleanUnits,
  cleanXpReward,
  normalizeNewQuest,
} from "./quests";

const quest = (done: boolean[]) => ({ objectives: done.map((d, i) => ({ id: `o${i}`, title: `O${i}`, done: d })) });

describe("new quests", () => {
  it("requires objectives for main and side quests, not dailies", () => {
    const base = { title: "x", domain: "body", xpReward: 100, isBoss: false, objectives: ["", "  "] };
    expect(() => normalizeNewQuest({ ...base, kind: "main" })).toThrow(/objective/);
    expect(normalizeNewQuest({ ...base, kind: "daily" }).objectives).toEqual([]);
  });

  it("dailies can't be bosses, and gold follows XP", () => {
    const q = normalizeNewQuest({ kind: "daily", title: "Stretch", domain: "body", xpReward: 20, isBoss: true, objectives: [] });
    expect(q).toMatchObject({ isBoss: false, goldReward: 2 });
  });
});

describe("titles and rewards", () => {
  it("trims and collapses spaces", () => expect(cleanTitle("  Run   far ")).toBe("Run far"));
  it("rejects empty and overly long titles", () => {
    expect(() => cleanTitle("   ")).toThrow(/title/);
    expect(() => cleanTitle("x".repeat(121))).toThrow(/120/);
  });
  it("bounds XP", () => {
    expect(cleanXpReward(99.6)).toBe(100);
    expect(() => cleanXpReward(-1)).toThrow();
    expect(() => cleanXpReward(5001)).toThrow();
    expect(() => cleanXpReward(Number.NaN)).toThrow();
  });
});

describe("removing objectives", () => {
  it("allows removing an open objective when another is still open", () => {
    expect(() => checkRemoveObjective(quest([false, false]), "o0")).not.toThrow();
  });
  it("blocks removing the last open objective", () => {
    expect(() => checkRemoveObjective(quest([true, false]), "o1")).toThrow(/last open/);
  });
  it("blocks removing finished objectives", () => {
    expect(() => checkRemoveObjective(quest([true, false, false]), "o0")).toThrow(/history/);
  });
  it("caps the number of objectives", () => {
    expect(() => checkAddObjective(quest(Array(30).fill(false)))).toThrow(/30/);
  });
});

describe("custom log amounts", () => {
  const run = getActivity("run"); // default 30, max 120
  it("defaults to the activity's default units", () => expect(cleanUnits(run, undefined)).toBe(30));
  it("rounds to one decimal", () => expect(cleanUnits(run, 42.26)).toBe(42.3));
  it("rejects zero, negatives and obvious typos", () => {
    expect(() => cleanUnits(run, 0)).toThrow();
    expect(() => cleanUnits(run, -5)).toThrow();
    expect(() => cleanUnits(run, 5000)).toThrow(/Typo/);
  });
  it("cleans notes", () => {
    expect(cleanNote("  ")).toBeNull();
    expect(cleanNote(" felt great ")).toBe("felt great");
    expect(() => cleanNote("x".repeat(281))).toThrow();
  });
});
