// Imports: turning outside activity (GitHub, Apple Health) into
// inbox items, and inbox items into activities. No network code here, so it's
// easy to test; fetching lives in src/app/import-actions.ts.
import { type Activity, type GameConfig, gameConfig, getActivity } from "../game/config";

/** "strava" only appears on old items from before it was removed. */
export type ImportSource = "github" | "health";

export interface ImportItem {
  id: string;
  source: ImportSource;
  externalId: string;
  kind: string;
  quantity: number;
  title: string;
  occurredOn: string;
  details: Record<string, unknown>;
  status: "pending" | "approved" | "ignored";
}

/** A new or refreshed item, before it has an id. */
export type ImportDraft = Omit<ImportItem, "id" | "status">;

// ---------- mapping an item to an activity ----------

export function mapImport(item: Pick<ImportItem, "source" | "kind" | "quantity">, config: GameConfig = gameConfig): { activity: Activity; units: number } {
  const im = config.imports;
  let slug: string;
  let units = item.quantity;
  if (item.source === "github") {
    slug = im.github.activity;
    units = item.quantity * im.github.minutesPerCommit;
  } else {
    // Apple Health (and old Strava items, which count as workouts).
    slug = im.health[item.kind as keyof typeof im.health] ?? im.health.workout;
    if (item.kind === "sleep") units = item.quantity / 60; // stored in minutes, scored in hours
  }
  const activity = getActivity(slug, config);
  return { activity, units: Math.min(Math.max(units, 0), activity.maxUnits) };
}

// ---------- GitHub ----------

export interface GithubCommit {
  sha: string;
  repo: string; // owner/name
  /** Local day of the commit (YYYY-MM-DD). */
  day: string;
}

/**
 * Groups commits into one item per repo per day. If a day was already
 * approved and more commits arrive later, only the new ones become a
 * follow-up item, so nothing is counted twice.
 */
export function groupGithubCommits(commits: ReadonlyArray<GithubCommit>, existing: ReadonlyArray<Pick<ImportItem, "externalId" | "status" | "details">>): ImportDraft[] {
  const byKey = new Map<string, GithubCommit[]>();
  for (const c of commits) {
    const key = `${c.repo}:${c.day}`;
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  const drafts: ImportDraft[] = [];
  for (const [key, list] of byKey) {
    const related = existing.filter((e) => e.externalId === key || e.externalId.startsWith(`${key}:+`));
    const seen = new Set(related.filter((e) => e.status !== "pending").flatMap((e) => (e.details.shas as string[] | undefined) ?? []));
    const fresh = [...new Set(list.map((c) => c.sha))].filter((sha) => !seen.has(sha));
    if (!fresh.length) continue;
    const pending = related.find((e) => e.status === "pending");
    const decided = related.filter((e) => e.status !== "pending").length;
    // Reuse the pending item if there is one, otherwise the base id, otherwise a numbered follow-up.
    const externalId = pending ? pending.externalId : decided === 0 ? key : `${key}:+${decided}`;
    const repoName = list[0].repo.split("/").pop() ?? list[0].repo;
    drafts.push({
      source: "github",
      externalId,
      kind: "commits",
      quantity: fresh.length,
      title: `${fresh.length} commit${fresh.length === 1 ? "" : "s"} to ${repoName}`,
      occurredOn: list[0].day,
      details: { repo: list[0].repo, shas: fresh },
    });
  }
  return drafts;
}

// ---------- Strava ----------

// ---------- Apple Health (iPhone Shortcut) ----------
// The payload parser and the list of metrics live in src/lib/health/metrics.ts.
export { type HealthRow, parseHealthPayload } from "../health/metrics";

/** A random import token for the iPhone Shortcut (shown once; only its hash is stored). */
export function newImportToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `lrpg_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
