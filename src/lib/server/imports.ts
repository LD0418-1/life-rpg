import "server-only";
// Server-side import plumbing shared by the import actions and routes:
// fetching from GitHub, saving drafts, and approving items into XP.
import { createHash } from "node:crypto";
import { computeProgress } from "@/lib/game/streaks";
import type { LogEntry } from "@/lib/game/types";
import { scoreEntry } from "@/lib/game/xp";
import { type GithubCommit, type ImportDraft, type ImportItem, groupGithubCommits, mapImport } from "@/lib/imports/core";
import { type LogEntryRow, toLogEntry } from "@/lib/supabase/rows";
import type { createClient } from "@/lib/supabase/server";
import { type Activity, gameConfig } from "@/lib/game/config";
import { withActivities } from "@/lib/game/activities";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const NEEDS_0006 = "Imports need a one-time database update first: run supabase/migrations/0006_imports.sql in the Supabase SQL Editor.";
const UA = "LifeRPG-Imports/1.0";

export interface ImportItemRow {
  id: string;
  source: ImportItem["source"];
  external_id: string;
  kind: string;
  quantity: number | string;
  title: string;
  occurred_on: string;
  details: Record<string, unknown> | null;
  status: ImportItem["status"];
}

export const IMPORT_COLUMNS = "id, source, external_id, kind, quantity, title, occurred_on, details, status";

export function toImportItem(r: ImportItemRow): ImportItem {
  return {
    id: r.id, source: r.source, externalId: r.external_id, kind: r.kind, quantity: Number(r.quantity), title: r.title,
    occurredOn: r.occurred_on, details: r.details ?? {}, status: r.status,
  };
}

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Inserts new drafts and refreshes pending ones (never touches approved or ignored items). */
export async function saveDrafts(supabase: Supabase, drafts: ImportDraft[]): Promise<number> {
  if (!drafts.length) return 0;
  const { data: existing } = await supabase
    .from("import_items")
    .select("external_id, status")
    .eq("source", drafts[0].source)
    .in("external_id", drafts.map((d) => d.externalId));
  const known = new Map((existing ?? []).map((e) => [e.external_id as string, e.status as string]));
  let added = 0;
  for (const d of drafts) {
    const row = { kind: d.kind, quantity: d.quantity, title: d.title, occurred_on: d.occurredOn, details: d.details };
    const status = known.get(d.externalId);
    if (status === undefined) {
      const { error } = await supabase.from("import_items").insert({ source: d.source, external_id: d.externalId, ...row });
      if (error && error.code !== "23505") throw new Error(error.message); // 23505 = already there (a parallel sync)
      if (!error) added++;
    } else if (status === "pending") {
      const { error } = await supabase.from("import_items").update(row).eq("source", d.source).eq("external_id", d.externalId).eq("status", "pending");
      if (error) throw new Error(error.message);
    }
  }
  return added;
}

// ---------- GitHub ----------

export async function syncGithub(supabase: Supabase, username: string, since: string): Promise<number> {
  const token = process.env.GITHUB_TOKEN;
  const commits: GithubCommit[] = [];
  for (let page = 1; page <= 3; page++) {
    const q = encodeURIComponent(`author:${username} author-date:>=${since}`);
    const res = await fetch(`https://api.github.com/search/commits?q=${q}&sort=author-date&order=desc&per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": UA,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 429) throw new Error("GitHub is rate-limiting requests. Try again in a minute.");
    if (res.status === 422) throw new Error(`GitHub doesn't know the user "${username}".`);
    if (!res.ok) throw new Error(`GitHub answered with an error (${res.status}).`);
    const body = (await res.json()) as { items?: { sha: string; repository?: { full_name?: string }; commit?: { author?: { date?: string } } }[] };
    for (const it of body.items ?? []) {
      const date = it.commit?.author?.date;
      const repo = it.repository?.full_name;
      // The author date carries the author's own time zone, so its first 10 characters are their local day.
      if (date && repo) commits.push({ sha: it.sha, repo, day: date.slice(0, 10) });
    }
    if ((body.items?.length ?? 0) < 100) break;
  }
  const { data: existing } = await supabase.from("import_items").select("external_id, status, details").eq("source", "github").gte("occurred_on", since);
  const drafts = groupGithubCommits(
    commits,
    (existing ?? []).map((e) => ({ externalId: e.external_id as string, status: e.status as ImportItem["status"], details: (e.details ?? {}) as Record<string, unknown> })),
  );
  return saveDrafts(supabase, drafts);
}

// ---------- approving ----------

/** Scores an item with the normal XP rules (repeats that day, momentum that day) and writes it to the ledger. */
export async function approveItem(
  supabase: Supabase,
  item: ImportItem,
  context: { days: { day: string; xp: number }[]; restDays: string[]; activities: Activity[] },
): Promise<LogEntry> {
  const { activity, units } = mapImport(item, withActivities(context.activities));
  const { count } = await supabase
    .from("log_entries")
    .select("id", { count: "exact", head: true })
    .eq("activity_slug", activity.slug)
    .eq("occurred_on", item.occurredOn);
  const momentumMultiplier = computeProgress(context.days, context.restDays, item.occurredOn).xpMultiplier;
  const difficulty = gameConfig.difficulty.default;
  const score = scoreEntry(activity, { units, difficulty, repeatIndex: count ?? 0, momentumMultiplier });
  const { data, error } = await supabase.rpc("approve_import", {
    p_item_id: item.id,
    p_activity_slug: activity.slug,
    p_domain: activity.domain,
    p_units: units,
    p_difficulty: difficulty,
    p_xp: score.xp,
    p_gold: score.gold,
  });
  if (error) throw new Error(error.message);
  const row = (data as LogEntryRow[] | null)?.[0];
  if (!row) throw new Error("The import was approved, but its entry wasn't returned. Refresh the page.");
  return toLogEntry(row);
}
