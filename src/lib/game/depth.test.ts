import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, EMPTY_STATS, achievementProgress, newlyEarned } from "./achievements";
import { buyBlocker, normalizeNewLoot } from "./loot";
import { type Skill, completedTrees, deleteBlocker, layoutTree, normalizeNewSkill, unlockBlocker } from "./skills";
import { checkTheme, effectiveTheme, nextThemeUnlock } from "./themes";

const skill = (id: string, parentId: string | null, unlocked = false, tree = "Guitar"): Skill => ({
  id, tree, name: id, requirement: null, domain: "craft", parentId, xpReward: 50, unlockedAt: unlocked ? "2026-11-09" : null,
});

describe("achievements", () => {
  it("have unique slugs", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.slug)).size).toBe(ACHIEVEMENTS.length);
  });
  it("finds newly earned ones and skips already recorded ones", () => {
    const stats = { ...EMPTY_STATS, activityEntries: 1, bestStreak: 8 };
    expect(newlyEarned(stats, {})).toEqual(["first-step", "week-warrior"]);
    expect(newlyEarned(stats, { "first-step": "2026-11-01" })).toEqual(["week-warrior"]);
  });
  it("reports capped progress", () => {
    const a = ACHIEVEMENTS.find((x) => x.slug === "unbreakable")!;
    expect(achievementProgress(a, { ...EMPTY_STATS, bestStreak: 12 })).toEqual({ current: 12, target: 30 });
    expect(achievementProgress(a, { ...EMPTY_STATS, bestStreak: 99 })).toEqual({ current: 30, target: 30 });
  });
});

describe("skill trees", () => {
  const tree = [skill("root", null, true), skill("a", "root"), skill("b", "root"), skill("a1", "a")];
  it("needs the parent unlocked first", () => {
    expect(unlockBlocker(tree, "a")).toBeNull();
    expect(unlockBlocker(tree, "a1")).toMatch(/Unlock "a" first/);
    expect(unlockBlocker(tree, "root")).toMatch(/already/);
  });
  it("only deletes locked leaves", () => {
    expect(deleteBlocker(tree, "a1")).toBeNull();
    expect(deleteBlocker(tree, "a")).toMatch(/after this one/);
    expect(deleteBlocker(tree, "root")).toMatch(/history/);
  });
  it("validates new skills", () => {
    const base = { tree: "Guitar", name: "Barre chords", requirement: " Play F cleanly ", domain: "craft", parentId: "a", xpReward: 80 };
    expect(normalizeNewSkill(base, tree)).toMatchObject({ requirement: "Play F cleanly", goldReward: 8 });
    expect(() => normalizeNewSkill({ ...base, parentId: null }, tree)).toThrow(/comes after/);
    expect(() => normalizeNewSkill({ ...base, name: "A" }, tree)).toThrow(/already/);
    expect(() => normalizeNewSkill({ ...base, parentId: "nope" }, tree)).toThrow(/same tree/);
    expect(normalizeNewSkill({ ...base, tree: "Cooking", parentId: null }, tree).tree).toBe("Cooking");
  });
  it("counts fully unlocked trees of 3+", () => {
    expect(completedTrees(tree)).toBe(0);
    expect(completedTrees([skill("r", null, true), skill("x", "r", true), skill("y", "r", true)])).toBe(1);
    expect(completedTrees([skill("r", null, true), skill("x", "r", true)])).toBe(0);
  });
  it("lays out trees with parents centered over children", () => {
    const { nodes, width, depth } = layoutTree(tree);
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    expect(width).toBe(2);
    expect(depth).toBe(3);
    expect(at("a1")).toMatchObject({ depth: 2, x: 0 });
    expect(at("b")).toMatchObject({ depth: 1, x: 1 });
    expect(at("root").x).toBe(0.5);
  });
});

describe("loot shop", () => {
  const item = { id: "i", name: "Coffee", description: null, cost: 30, repeatable: false };
  it("validates rewards", () => {
    expect(normalizeNewLoot({ name: " Coffee ", description: "", cost: 29.6, repeatable: true })).toMatchObject({ name: "Coffee", cost: 30, description: null });
    expect(() => normalizeNewLoot({ name: "x", description: "", cost: 0, repeatable: true })).toThrow(/Cost/);
  });
  it("checks gold and once-only rewards", () => {
    expect(buyBlocker(item, 50, [])).toBeNull();
    expect(buyBlocker(item, 10, [])).toMatch(/Not enough gold/);
    expect(buyBlocker(item, 50, [{ id: "p", itemId: "i", cost: 30, purchasedAt: "", redeemedAt: null }])).toMatch(/once/);
  });
});

describe("themes", () => {
  it("unlock by level and fall back to the default", () => {
    expect(() => checkTheme("cobalt", 4)).toThrow(/level 5/);
    expect(() => checkTheme("cobalt", 5)).not.toThrow();
    expect(effectiveTheme("royal", 3).id).toBe("crimson");
    expect(effectiveTheme("cobalt", 7).id).toBe("cobalt");
    expect(nextThemeUnlock(5)?.id).toBe("jade");
    expect(nextThemeUnlock(99)).toBeNull();
  });
});
