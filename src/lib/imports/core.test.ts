import { describe, expect, it } from "vitest";
import { groupGithubCommits, mapImport, newImportToken, parseHealthPayload, stravaToDraft } from "./core";

describe("mapping imports to activities", () => {
  it("turns commits into code minutes, capped", () => {
    expect(mapImport({ source: "github", kind: "commits", quantity: 4 })).toMatchObject({ units: 60 });
    expect(mapImport({ source: "github", kind: "commits", quantity: 4 }).activity.slug).toBe("code");
    expect(mapImport({ source: "github", kind: "commits", quantity: 100 }).units).toBe(240); // code maxUnits
  });
  it("maps Strava runs to run and everything else to workout", () => {
    expect(mapImport({ source: "strava", kind: "TrailRun", quantity: 50 }).activity.slug).toBe("run");
    expect(mapImport({ source: "strava", kind: "Ride", quantity: 50 }).activity.slug).toBe("workout");
  });
  it("maps Health kinds", () => {
    expect(mapImport({ source: "health", kind: "steps", quantity: 9000 })).toMatchObject({ units: 9000 });
    expect(mapImport({ source: "health", kind: "steps", quantity: 9000 }).activity.slug).toBe("walk");
    expect(mapImport({ source: "health", kind: "mindful", quantity: 10 }).activity.slug).toBe("meditate");
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

describe("Strava", () => {
  it("makes an inbox item from an activity", () => {
    expect(
      stravaToDraft({ id: 123, name: "Morning Run", sport_type: "Run", moving_time: 1830, distance: 5230, start_date_local: "2026-11-10T07:12:00Z" }),
    ).toEqual({
      source: "strava", externalId: "123", kind: "Run", quantity: 31, title: "Morning Run · 31 min · 5.2 km",
      occurredOn: "2026-11-10", details: { sport: "Run", distanceKm: 5.2 },
    });
  });
  it("skips activities under a minute", () => {
    expect(stravaToDraft({ id: 1, name: "Oops", moving_time: 20, start_date_local: "2026-11-10T07:12:00Z" })).toBeNull();
  });
});

describe("Apple Health payload", () => {
  it("reads numbers, including Shortcuts-style strings", () => {
    expect(parseHealthPayload({ date: "2026-11-10", steps: "8,423", workout_minutes: 35.4, mindful_minutes: 0 }, "2026-11-11")).toEqual([
      { kind: "steps", day: "2026-11-10", quantity: 8423 },
      { kind: "workout", day: "2026-11-10", quantity: 35 },
    ]);
  });
  it("uses the fallback day and trims timestamps", () => {
    expect(parseHealthPayload({ steps: 100 }, "2026-11-11")[0].day).toBe("2026-11-11");
    expect(parseHealthPayload({ date: "2026-11-10T21:30:00+08:00", steps: 100 }, "x")[0].day).toBe("2026-11-10");
  });
  it("rejects junk", () => {
    expect(() => parseHealthPayload([], "2026-11-11")).toThrow(/object/);
    expect(() => parseHealthPayload({ date: "yesterday", steps: 1 }, "2026-11-11")).toThrow(/date/);
    expect(() => parseHealthPayload({ steps: "lots" }, "2026-11-11")).toThrow(/number/);
    expect(() => parseHealthPayload({ steps: 0 }, "2026-11-11")).toThrow(/Nothing/);
  });
  it("makes long random tokens", () => {
    const a = newImportToken();
    expect(a).toMatch(/^lrpg_[0-9a-f]{64}$/);
    expect(newImportToken()).not.toBe(a);
  });
});
