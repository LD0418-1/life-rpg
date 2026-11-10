import { describe, expect, it } from "vitest";
import { type ActivityOverride, mergeActivities, moveActivity, normalizeActivityInput, overrideFields, quickLogActivities, slugFor } from "./activities";
import { gameConfig } from "./config";
import { type DiaryEntry, excerpt, normalizeDiaryInput, searchDiary, sortDiary } from "./diary";
import { basicRecap, buildWeekStats, lastFinishedWeek, parseRecap, recapPrompt, weekLabel } from "./recap";
import type { LogEntry } from "./types";
import { emptyTotals } from "./xp";

const blank = (slug: string, extra: Partial<ActivityOverride> = {}): ActivityOverride => ({
  slug, name: null, domain: null, unit: null, baseXp: null, xpPerUnit: null, maxUnits: null, defaultUnits: null, quick: null, hidden: false, position: null, ...extra,
});

describe("activities", () => {
  it("is just xp.json with no changes", () => {
    const list = mergeActivities([]);
    expect(list.map((a) => a.slug)).toEqual(gameConfig.activities.map((a) => a.slug));
    expect(list.every((a) => a.builtIn && !a.hidden && !a.edited)).toBe(true);
  });
  it("overrides only the fields you set, and hides", () => {
    const list = mergeActivities([blank("run", { baseXp: 25, name: "Long run" }), blank("read", { hidden: true })]);
    const run = list.find((a) => a.slug === "run")!;
    expect(run).toMatchObject({ name: "Long run", baseXp: 25, xpPerUnit: 1, unit: "minute", edited: true });
    expect(quickLogActivities(list).some((a) => a.slug === "read")).toBe(false);
    expect(list.some((a) => a.slug === "read")).toBe(true); // still scored for old entries / imports
  });
  it("adds your own, skips broken rows, and sorts by position", () => {
    const guitar = blank("guitar", { name: "Guitar", domain: "craft", unit: "minute", baseXp: 5, xpPerUnit: 1, maxUnits: 120, defaultUnits: 30, quick: true, position: -1 });
    const broken = blank("oops", { name: "Half" });
    const badDomain = { ...guitar, slug: "x", domain: "nope" };
    const list = mergeActivities([guitar, broken, badDomain]);
    expect(list[0]).toMatchObject({ slug: "guitar", builtIn: false });
    expect(list.some((a) => a.slug === "oops" || a.slug === "x")).toBe(false);
  });
  it("validates input", () => {
    const ok = { name: "  Play   guitar ", domain: "craft", unit: "Minutes", baseXp: 5, xpPerUnit: 1, maxUnits: 120, defaultUnits: 30, quick: true };
    expect(normalizeActivityInput(ok)).toMatchObject({ name: "Play guitar", unit: "minute" });
    expect(normalizeActivityInput({ ...ok, unit: "glass" }).unit).toBe("glass");
    expect(normalizeActivityInput({ ...ok, unit: "session", xpPerUnit: 9, defaultUnits: 4 })).toMatchObject({ xpPerUnit: 0, maxUnits: 1, defaultUnits: 1 });
    expect(() => normalizeActivityInput({ ...ok, name: " " })).toThrow(/name/);
    expect(() => normalizeActivityInput({ ...ok, domain: "nope" })).toThrow(/domain/);
    expect(() => normalizeActivityInput({ ...ok, defaultUnits: 500 })).toThrow(/tap amount/);
    expect(() => normalizeActivityInput({ ...ok, baseXp: 9999 })).toThrow(/Base XP/);
    expect(() => normalizeActivityInput({ ...ok, baseXp: 0, xpPerUnit: 0 })).toThrow(/0 XP/);
  });
  it("stores only what differs from xp.json", () => {
    const run = gameConfig.activities.find((a) => a.slug === "run")!;
    const fields = overrideFields({ ...run, baseXp: 20 }, run);
    expect(fields.baseXp).toBe(20);
    expect(fields.name).toBeNull();
    expect(overrideFields({ ...run }, undefined).name).toBe("Run");
  });
  it("makes unique slugs and reorders", () => {
    expect(slugFor("Play Guitar!", ["run"])).toBe("play-guitar");
    expect(slugFor("Run", ["run", "run-2"])).toBe("run-3");
    expect(slugFor("😀", [])).toBe("activity");
    const list = mergeActivities([]);
    const moved = moveActivity(list, "workout", -1);
    expect(moved.slice(0, 2)).toEqual([{ slug: "workout", position: 0 }, { slug: "run", position: 1 }]);
    expect(moveActivity(list, "run", -1)[0]).toEqual({ slug: "run", position: 0 });
  });
});

describe("diary", () => {
  const today = "2026-11-10";
  it("cleans and checks entries", () => {
    expect(normalizeDiaryInput({ day: today, title: "  A  day ", body: " line one  \r\n\r\nline two \n", mood: 4 }, today)).toEqual({
      day: today, title: "A day", body: "line one\n\nline two", mood: 4, isPublic: false,
    });
    expect(normalizeDiaryInput({ day: today, title: "", body: "x" }, today).title).toBeNull();
    expect(() => normalizeDiaryInput({ day: "2026-11-11", body: "x" }, today)).toThrow(/future/);
    expect(() => normalizeDiaryInput({ day: "2026-02-30", body: "x" }, today)).toThrow(/date/);
    expect(() => normalizeDiaryInput({ day: today, body: "   " }, today)).toThrow(/Write/);
    expect(() => normalizeDiaryInput({ day: today, body: "x", mood: 9 }, today)).toThrow(/Mood/);
  });
  it("searches, sorts and excerpts", () => {
    const e = (id: string, day: string, body: string, title: string | null = null): DiaryEntry => ({ id, day, title, body, mood: null, isPublic: false, createdAt: `${day}T10:00:00Z`, updatedAt: "" });
    const all = [e("a", "2026-11-01", "Ran in the rain"), e("b", "2026-11-05", "Quiet day", "Rain again"), e("c", "2026-11-03", "Coding")];
    expect(searchDiary(all, "RAIN").map((x) => x.id)).toEqual(["a", "b"]);
    expect(searchDiary(all, "rain quiet").map((x) => x.id)).toEqual(["b"]);
    expect(sortDiary(all).map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(excerpt("word ".repeat(100), 20)).toMatch(/…$/);
    expect(excerpt("short")).toBe("short");
  });
});

describe("weekly recap", () => {
  let n = 0;
  const entry = (day: string, domain: string, xp: number, extra: Partial<LogEntry> = {}): LogEntry => ({
    id: `e${++n}`, activitySlug: "run", domain, units: 30, difficulty: 3, xp, gold: Math.round(xp / 10), occurredOn: day, source: "manual", ...extra,
  });

  it("knows its weeks", () => {
    expect(lastFinishedWeek("2026-11-10")).toBe("2026-11-02"); // Tuesday → the Monday a week before
    expect(lastFinishedWeek("2026-11-09")).toBe("2026-11-02"); // Monday
    expect(weekLabel("2026-11-02")).toBe("Nov 2 – 8");
    expect(weekLabel("2026-10-26")).toBe("Oct 26 – Nov 1");
  });

  it("builds the numbers for one week, winding totals back to the end of it", () => {
    const entries = [
      entry("2026-10-28", "body", 50), // the week before
      entry("2026-11-02", "body", 400),
      entry("2026-11-03", "mind", 100, { activitySlug: "read", units: 20 }),
      entry("2026-11-03", "craft", 80, { activitySlug: null, source: "quest", questId: "q1", note: "Ship the site" }),
      entry("2026-11-04", "spirit", 15, { activitySlug: null, source: "quest", questId: "d1", note: "Stretch" }),
      entry("2026-11-10", "body", 999), // after the week: must not count
    ];
    const totals = emptyTotals();
    for (const e of entries) totals[e.domain] = { xp: totals[e.domain].xp + e.xp, gold: totals[e.domain].gold + e.gold };
    const stats = buildWeekStats({
      weekStart: "2026-11-02",
      today: "2026-11-10",
      entries,
      totals,
      days: [{ day: "2026-10-28", xp: 50 }, { day: "2026-11-02", xp: 400 }, { day: "2026-11-03", xp: 180 }, { day: "2026-11-04", xp: 15 }, { day: "2026-11-10", xp: 999 }],
      restDays: ["2026-11-05"],
      activities: gameConfig.activities,
      quests: { q1: { kind: "main", isBoss: false }, d1: { kind: "daily", isBoss: false } },
      trophies: [{ name: "First step", day: "2026-11-02" }, { name: "Old", day: "2026-10-01" }],
      skills: [],
      seasons: [{ id: "s1", name: "Autumn", startsOn: "2026-11-01", endsOn: "2026-11-30", notes: null }],
      seasonGoals: [{ seasonId: "s1", title: "Ship the site", doneOn: "2026-11-03" }, { seasonId: "s1", title: "Read 3 books", doneOn: null }],
      diaryEntries: 2,
    });
    expect(stats).toMatchObject({ weekEnd: "2026-11-08", xp: 595, prevWeekXp: 50, activeDays: 3, restDays: 1, bestDay: { day: "2026-11-02", xp: 400 }, dailiesDone: 1, questsCleared: ["Ship the site"] });
    expect(stats.domains[0]).toMatchObject({ id: "body", xp: 400, levelTo: 3 }); // 450 body XP at the end of the week, not 1449
    expect(stats.domains[0].levelFrom).toBe(1);
    expect(stats.trophies).toEqual(["First step"]);
    expect(stats.topActivities[0]).toMatchObject({ name: "Run", times: 1, amount: 30 });
    expect(stats.season).toMatchObject({ name: "Autumn", dayNumber: 8, goalsDone: 1, goalsTotal: 2, goalsDoneThisWeek: ["Ship the site"] });

    const basic = basicRecap(stats);
    expect(basic.body).toContain("595 XP");
    expect(basic.body).toContain("Next week:");
    const prompt = recapPrompt(stats, [{ day: "2026-11-03", title: "Good", body: "Felt strong", mood: 5 }], "Leo");
    expect(prompt).toContain("<week_data>");
    expect(prompt).toContain("Felt strong");
  });

  it("handles an empty week", () => {
    const stats = buildWeekStats({
      weekStart: "2026-11-02", today: "2026-11-10", entries: [], totals: emptyTotals(), days: [], restDays: [], activities: [], quests: {}, trophies: [], skills: [], seasons: [], seasonGoals: [], diaryEntries: 0,
    });
    expect(stats.xp).toBe(0);
    expect(basicRecap(stats).title).toBe("A quiet week");
  });

  it("parses Claude's reply", () => {
    expect(parseRecap("# “Momentum Builds.”\n\nPara one.\n\n\n\nNext week: rest.")).toEqual({ title: "Momentum Builds", body: "Para one.\n\nNext week: rest." });
    expect(parseRecap("Only one line")).toEqual({ title: "Week in review", body: "Only one line" });
    expect(() => parseRecap("  ")).toThrow();
  });
});
