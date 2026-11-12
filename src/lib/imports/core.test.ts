import { describe, expect, it } from "vitest";
import { groupGithubCommits, mapImport, newImportToken, parseHealthPayload } from "./core";
import { formatMetric, metricInfo } from "../health/metrics";

describe("mapping imports to activities", () => {
  it("turns commits into code minutes, capped", () => {
    expect(mapImport({ source: "github", kind: "commits", quantity: 4 })).toMatchObject({ units: 60 });
    expect(mapImport({ source: "github", kind: "commits", quantity: 4 }).activity.slug).toBe("code");
    expect(mapImport({ source: "github", kind: "commits", quantity: 100 }).units).toBe(240); // code maxUnits
  });
  it("treats old Strava items as workouts", () => {
    expect(mapImport({ source: "strava" as "health", kind: "Ride", quantity: 50 }).activity.slug).toBe("workout");
  });
  it("maps Health kinds", () => {
    expect(mapImport({ source: "health", kind: "steps", quantity: 9000 })).toMatchObject({ units: 9000 });
    expect(mapImport({ source: "health", kind: "steps", quantity: 9000 }).activity.slug).toBe("walk");
    expect(mapImport({ source: "health", kind: "mindful", quantity: 10 }).activity.slug).toBe("meditate");
    // Sleep is stored in minutes and scored in hours, capped at 8.
    expect(mapImport({ source: "health", kind: "sleep", quantity: 450 })).toMatchObject({ units: 7.5 });
    expect(mapImport({ source: "health", kind: "sleep", quantity: 600 }).units).toBe(8);
    expect(mapImport({ source: "health", kind: "sleep", quantity: 450 }).activity.slug).toBe("sleep");
  });
});

describe("GitHub grouping", () => {
  const c = (sha: string, repo = "me/life-rpg", day = "2026-11-10") => ({ sha, repo, day });

  it("groups commits per repo per day", () => {
    const drafts = groupGithubCommits([c("a"), c("b"), c("x", "me/other"), c("d", "me/life-rpg", "2026-11-09")], []);
    expect(drafts.map((d) => [d.externalId, d.quantity, d.title])).toEqual([
      ["me/life-rpg:2026-11-10", 2, "2 commits to life-rpg"],
      ["me/other:2026-11-10", 1, "1 commit to other"],
      ["me/life-rpg:2026-11-09", 1, "1 commit to life-rpg"],
    ]);
  });

  it("refreshes a pending item with the full count", () => {
    const existing = [{ externalId: "me/life-rpg:2026-11-10", status: "pending" as const, details: { shas: ["a"] } }];
    const [d] = groupGithubCommits([c("a"), c("b")], existing);
    expect(d).toMatchObject({ externalId: "me/life-rpg:2026-11-10", quantity: 2 });
  });

  it("after a day was approved, only new commits become a follow-up item", () => {
    const existing = [{ externalId: "me/life-rpg:2026-11-10", status: "approved" as const, details: { shas: ["a", "b"] } }];
    expect(groupGithubCommits([c("a"), c("b")], existing)).toEqual([]);
    const [d] = groupGithubCommits([c("a"), c("b"), c("e")], existing);
    expect(d).toMatchObject({ externalId: "me/life-rpg:2026-11-10:+1", quantity: 1, details: { shas: ["e"] } });
  });

  it("doesn't bring back commits you ignored", () => {
    const existing = [{ externalId: "me/life-rpg:2026-11-10", status: "ignored" as const, details: { shas: ["a"] } }];
    expect(groupGithubCommits([c("a")], existing)).toEqual([]);
  });
});

describe("Apple Health payload", () => {
  it("reads numbers, including Shortcuts-style strings, and makes XP items", () => {
    const r = parseHealthPayload({ date: "2026-11-10", steps: "8,423", workout_minutes: 35.4, mindful_minutes: 0, resting_heart_rate: "58 count/min" }, "2026-11-11");
    expect(r.items).toEqual([
      { kind: "steps", day: "2026-11-10", quantity: 8423 },
      { kind: "workout", day: "2026-11-10", quantity: 35 },
    ]);
    expect(r.metrics.find((m) => m.metric === "resting_heart_rate")).toMatchObject({ value: 58, samples: 1 });
    expect(r.metrics.find((m) => m.metric === "mindful_minutes")?.value).toBe(0); // stored, but no XP item
  });
  it("combines lists of samples the right way", () => {
    const r = parseHealthPayload({ date: "2026-11-10", heart_rate: [60, 70, "110"], steps: [1000, 2500], weight_kg: [80.4, 80.1], blood_oxygen: [0.97, 0.99] }, "x");
    const by = Object.fromEntries(r.metrics.map((m) => [m.metric, m]));
    expect(by.heart_rate).toMatchObject({ value: 80, min: 60, max: 110, samples: 3 });
    expect(by.steps.value).toBe(3500); // added up
    expect(by.weight_kg.value).toBe(80.1); // latest
    expect(by.blood_oxygen.value).toBe(98); // fractions become percent
  });
  it("converts units, keeps unknown metrics, and turns sleep into minutes for XP", () => {
    const r = parseHealthPayload({ date: "2026-11-10", sleep_minutes: 450, weight_lb: 176.4, "Vitamin C": 90, metrics: { water_l: 1.5 } }, "x");
    const by = Object.fromEntries(r.metrics.map((m) => [m.metric, m]));
    expect(by.sleep_hours.value).toBe(7.5);
    expect(by.weight_kg.value).toBeCloseTo(80, 0);
    expect(by.water_ml.value).toBe(1500);
    expect(by.vitamin_c.value).toBe(90);
    expect(metricInfo("vitamin_c")).toMatchObject({ group: "other", label: "Vitamin c" });
    expect(r.items).toEqual([{ kind: "sleep", day: "2026-11-10", quantity: 450 }]);
  });
  it("accepts several days at once", () => {
    const r = parseHealthPayload({ days: [{ date: "2026-11-09", steps: 100 }, { date: "2026-11-10", steps: 200 }] }, "x");
    expect(r.metrics.map((m) => m.day)).toEqual(["2026-11-09", "2026-11-10"]);
  });
  it("uses the fallback day and trims timestamps", () => {
    expect(parseHealthPayload({ steps: 100 }, "2026-11-11").metrics[0].day).toBe("2026-11-11");
    expect(parseHealthPayload({ date: "2026-11-10T21:30:00+08:00", steps: 100 }, "x").metrics[0].day).toBe("2026-11-10");
  });
  it("reads Shortcuts' own date text and lists sent as text", () => {
    expect(parseHealthPayload({ date: "Nov 9, 2026 at 11:30 PM", steps: 1 }, null).metrics[0].day).toBe("2026-11-09");
    expect(parseHealthPayload({ date: "9 November 2026 at 23:30", steps: 1 }, null).metrics[0].day).toBe("2026-11-09");
    expect(() => parseHealthPayload({ date: "11/09/2026", steps: 1 }, null)).toThrow(/yyyy-MM-dd/);
    expect(() => parseHealthPayload({ steps: 1 }, null)).toThrow(/Add a "date"/);
    const r = parseHealthPayload({ date: "2026-11-09", heart_rate: "62 count/min\n75 count/min\n88 count/min" }, null);
    expect(r.metrics[0]).toMatchObject({ value: 75, min: 62, max: 88, samples: 3 });
  });
  it("reads durations as text or seconds", () => {
    const r = parseHealthPayload({ date: "2026-11-12", sleep_hours: "7 hr 30 min", workout_minutes: "1 hr 5 min", deep_sleep_seconds: 3960, run_seconds: [600, 1200], mindful_minutes: "0:10:00" }, null);
    const by = Object.fromEntries(r.metrics.map((m) => [m.metric, m.value]));
    expect(by).toMatchObject({ sleep_hours: 7.5, workout_minutes: 65, deep_sleep_hours: 1.1, run_minutes: 30, mindful_minutes: 10 });
    // A sleep duration sent under the minutes name still works.
    expect(parseHealthPayload({ date: "2026-11-12", sleep_minutes: "7 hr 30 min" }, null).metrics[0]).toMatchObject({ metric: "sleep_hours", value: 7.5 });
    expect(r.items.find((i) => i.kind === "sleep")?.quantity).toBe(450);
  });
  it("rejects junk", () => {
    expect(() => parseHealthPayload([], "2026-11-11")).toThrow(/object/);
    expect(() => parseHealthPayload({ date: "yesterday", steps: 1 }, "2026-11-11")).toThrow(/date/);
    expect(() => parseHealthPayload({ steps: "lots" }, "2026-11-11")).toThrow(/number/);
    expect(() => parseHealthPayload({ heart_rate: 900 }, "2026-11-11")).toThrow(/too large/);
    expect(() => parseHealthPayload({ steps: -5 }, "2026-11-11")).toThrow(/negative/);
    expect(() => parseHealthPayload({ date: "2026-11-10" }, "2026-11-11")).toThrow(/Nothing/);
  });
  it("formats values", () => {
    expect(formatMetric("steps", 8423)).toBe("8,423 steps");
    expect(formatMetric("sleep_hours", 7.46)).toBe("7.5 h");
    expect(formatMetric("blood_oxygen", 97.6)).toBe("98%");
    expect(formatMetric("steps", null)).toBe("—");
  });
  it("makes long random tokens", () => {
    const a = newImportToken();
    expect(a).toMatch(/^lrpg_[0-9a-f]{64}$/);
    expect(newImportToken()).not.toBe(a);
  });
});
