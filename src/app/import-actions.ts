"use server";

// Imports inbox: connect sources, sync, approve / ignore.
import { loadActivities } from "@/lib/supabase/phase8-data";
import { addDays } from "@/lib/game/streaks";
import type { ImportsData, LogEntry } from "@/lib/game/types";
import { type ImportItem, type ImportSource, newImportToken } from "@/lib/imports/core";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import {
  IMPORT_COLUMNS,
  type ImportItemRow,
  NEEDS_0006,
  approveItem,
  sha256Hex,
  syncGithub,
  toImportItem,
} from "@/lib/server/imports";
import { isMissingRelation, loadStreakData } from "@/lib/supabase/streak-data";

const AUTO_SYNC_MS = 30 * 60_000;

type ConnRow = { source: ImportSource; settings: Record<string, unknown> | null; secret: string | null; token_hash: string | null; last_synced_at: string | null };

async function loadConnections(supabase: Awaited<ReturnType<typeof ownerContext>>["supabase"]) {
  const { data, error } = await supabase.from("import_connections").select("source, settings, secret, token_hash, last_synced_at");
  if (error) throw error;
  return new Map(((data ?? []) as ConnRow[]).map((c) => [c.source, c]));
}

async function syncSources(only?: ImportSource, onlyIfStale = false): Promise<{ added: number; errors: string[] }> {
  const { supabase, today } = await ownerContext();
  const conns = await loadConnections(supabase);
  let added = 0;
  const errors: string[] = [];
  const stale = (c: ConnRow) => !onlyIfStale || !c.last_synced_at || Date.now() - Date.parse(c.last_synced_at) > AUTO_SYNC_MS;
  const sinceDay = (c: ConnRow, fallbackDays: number) =>
    c.last_synced_at ? addDays(c.last_synced_at.slice(0, 10), -2) : addDays(today, -fallbackDays);

  const gh = conns.get("github");
  const username = typeof gh?.settings?.username === "string" ? gh.settings.username : null;
  if (gh && username && (!only || only === "github") && stale(gh)) {
    try {
      added += await syncGithub(supabase, username, sinceDay(gh, 14));
      await supabase.from("import_connections").update({ last_synced_at: new Date().toISOString() }).eq("source", "github");
    } catch (e) {
      errors.push(`GitHub: ${e instanceof Error ? e.message : "sync failed"}`);
    }
  }
  return { added, errors };
}

export async function loadImportsAction(): Promise<ActionResult<ImportsData>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    try {
      await loadConnections(supabase); // also tells us whether 0006 has been run
    } catch (e) {
      if (isMissingRelation(e as { code?: string; message?: string })) {
        return {
          ready: false, pending: [], recent: [],
          connections: {
            github: { username: null, lastSyncedAt: null, hasToken: Boolean(process.env.GITHUB_TOKEN) },
            health: { hasToken: false, lastSyncedAt: null },
          },
        };
      }
      throw e;
    }
    // Quietly fetch anything new if the last sync was a while ago.
    await syncSources(undefined, true).catch(() => undefined);
    const [pending, recent, fresh] = await Promise.all([
      supabase.from("import_items").select(IMPORT_COLUMNS).eq("status", "pending").order("occurred_on", { ascending: false }).limit(200),
      supabase.from("import_items").select(IMPORT_COLUMNS).neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
      loadConnections(supabase),
    ]);
    if (pending.error) throw new Error(pending.error.message);
    if (recent.error) throw new Error(recent.error.message);
    const gh = fresh.get("github");
    const he = fresh.get("health");
    return {
      ready: true,
      pending: ((pending.data ?? []) as ImportItemRow[]).map(toImportItem),
      recent: ((recent.data ?? []) as ImportItemRow[]).map(toImportItem),
      connections: {
        github: { username: (gh?.settings?.username as string) ?? null, lastSyncedAt: gh?.last_synced_at ?? null, hasToken: Boolean(process.env.GITHUB_TOKEN) },
        health: { hasToken: Boolean(he?.token_hash), lastSyncedAt: he?.last_synced_at ?? null },
      },
    };
  });
}

export async function syncImportsAction(source?: ImportSource): Promise<ActionResult<{ added: number; errors: string[] }>> {
  return run(() => syncSources(source));
}

async function loadItem(supabase: Awaited<ReturnType<typeof ownerContext>>["supabase"], itemId: string): Promise<ImportItem> {
  const { data, error } = await supabase.from("import_items").select(IMPORT_COLUMNS).eq("id", itemId).maybeSingle<ImportItemRow>();
  if (error) throw new Error(isMissingRelation(error) ? NEEDS_0006 : error.message);
  if (!data) throw new Error("That import no longer exists.");
  return toImportItem(data);
}

export async function approveImportAction(itemId: string): Promise<ActionResult<LogEntry>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const item = await loadItem(supabase, itemId);
    const [streak, { activities }] = await Promise.all([loadStreakData(supabase), loadActivities(supabase)]);
    return approveItem(supabase, item, { days: streak.days, restDays: streak.restDays, activities });
  });
}

async function setStatus(itemId: string, from: ImportItem["status"][], to: ImportItem["status"]) {
  const { supabase } = await ownerContext();
  const { data, error } = await supabase
    .from("import_items")
    .update({ status: to, decided_at: to === "pending" ? null : new Date().toISOString() })
    .eq("id", itemId)
    .in("status", from)
    .select("id");
  if (error) throw new Error(isMissingRelation(error) ? NEEDS_0006 : error.message);
  if (!data?.length) throw new Error("That import changed in the meantime. Refresh the page.");
}

export async function ignoreImportAction(itemId: string): Promise<ActionResult<void>> {
  return run(() => setStatus(itemId, ["pending"], "ignored"));
}

export async function restoreImportAction(itemId: string): Promise<ActionResult<void>> {
  return run(() => setStatus(itemId, ["ignored"], "pending"));
}

export async function saveGithubAction(username: string | null): Promise<ActionResult<void>> {
  return run(async () => {
    const name = (username ?? "").trim().replace(/^@/, "");
    if (name && !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(name)) throw new Error("That doesn't look like a GitHub username.");
    const { supabase } = await ownerContext();
    const { error } = name
      ? await supabase.from("import_connections").upsert({ source: "github", settings: { username: name }, last_synced_at: null }, { onConflict: "source" })
      : await supabase.from("import_connections").delete().eq("source", "github");
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0006 : error.message);
  });
}

export async function disconnectImportAction(source: ImportSource): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("import_connections").delete().eq("source", source);
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0006 : error.message);
  });
}

/** A fresh token for the iPhone Shortcut. Only its fingerprint is saved; the old token stops working. */
export async function createHealthTokenAction(): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const token = newImportToken();
    const { error } = await supabase.from("import_connections").upsert({ source: "health", token_hash: sha256Hex(token) }, { onConflict: "source" });
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0006 : error.message);
    return token;
  });
}
