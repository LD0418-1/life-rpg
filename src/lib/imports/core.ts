// Imports: turning outside activity (GitHub, Strava, Apple Health) into
// inbox items, and inbox items into activities. No network code here, so it's
// easy to test; fetching lives in src/app/import-actions.ts.
import { type Activity, type GameConfig, gameConfig, getActivity } from "../game/config";
import { isDay } from "../game/streaks";

export type ImportSource = "github" | "strava" | "health";

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
  } else if (item.source === "strava") {
    slug = im.strava.runSports.includes(item.kind) ? im.strava.runActivity : im.strava.otherActivity;
  } else {
    slug = im.health[item.kind as keyof typeof im.health] ?? im.health.workout;
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

export interface StravaActivity {
  id: number | string;
  name: string;
  sport_type?: string;
  type?: string;
  moving_time: number; // seconds
  distance?: number; // meters
  start_date_local: string; // "2026-11-10T07:12:00Z" (local time, Z is cosmetic)
}

export function stravaToDraft(a: StravaActivity): ImportDraft | null {
  const minutes = Math.round(a.moving_time / 60);
  if (minutes < 1) return null;
  const sport = a.sport_type || a.type || "Workout";
  const km = a.distance ? Math.round(a.distance / 100) / 10 : null;
  return {
    source: "strava",
    externalId: String(a.id),
    kind: sport,
    quantity: minutes,
    title: `${a.name || sport} · ${minutes} min${km ? ` · ${km} km` : ""}`,
    occurredOn: a.start_date_local.slice(0, 10),
    details: { sport, distanceKm: km },
  };
}

// ---------- Apple Health (iPhone Shortcut) ----------

export interface HealthRow {
  kind: "steps" | "workout" | "run" | "mindful";
  day: string;
  quantity: number;
}

const HEALTH_FIELDS: Record<string, HealthRow["kind"]> = {
  steps: "steps",
  workout_minutes: "workout",
  run_minutes: "run",
  mindful_minutes: "mindful",
};

/**
 * Reads what the Shortcut sends: { date, steps, workout_minutes, run_minutes, mindful_minutes }.
 * Numbers may arrive as strings ("8,423" or "35.5"), because that's how Shortcuts formats them.
 */
export function parseHealthPayload(body: unknown, fallbackDay: string): HealthRow[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Send a JSON object.");
  const obj = body as Record<string, unknown>;
  const rawDay = typeof obj.date === "string" ? obj.date.trim().slice(0, 10) : fallbackDay;
  if (!isDay(rawDay)) throw new Error('"date" must look like 2026-11-10.');
  const rows: HealthRow[] = [];
  for (const [field, kind] of Object.entries(HEALTH_FIELDS)) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") continue;
    const n = typeof obj[field] === "number" ? (obj[field] as number) : Number(String(obj[field]).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) throw new Error(`"${field}" must be a number.`);
    if (n > 0) rows.push({ kind, day: rawDay, quantity: Math.round(n) });
  }
  if (!rows.length) throw new Error("Nothing to import: send steps, workout_minutes, run_minutes or mindful_minutes.");
  return rows;
}

/** A random import token for the iPhone Shortcut (shown once; only its hash is stored). */
export function newImportToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `lrpg_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
