"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { gameConfig } from "@/lib/game/config";
import { unitLabel } from "@/lib/game/format";
import type { ImportsData } from "@/lib/game/types";
import { scoreEntry } from "@/lib/game/xp";
import { type ImportItem, mapImport } from "@/lib/imports/core";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";
import { HealthShortcutGuide } from "../HealthShortcutGuide";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const SOURCE_LABEL: Record<string, string> = { github: "GitHub", strava: "Strava", health: "Apple Health" };
const dayLabel = (day: string, today: string) =>
  day === today ? "Today" : new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      })}
      className="skew-box shrink-0 bg-ink-3 px-3 py-1 font-label text-xs font-extrabold tracking-widest uppercase hover:bg-crimson"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function GithubCard({ data, onChange }: { data: ImportsData["connections"]["github"]; onChange: () => void }) {
  const { backend } = useGame();
  const [name, setName] = useState(data.username ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (value: string | null) => {
    try {
      await backend.saveGithub(value);
      setMsg(value ? "Saved. Syncing…" : "Disconnected.");
      if (value) await backend.syncImports("github").then((r) => setMsg(r.errors[0] ?? `Synced: ${r.added} new.`));
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    }
  };
  return (
    <div>
      <h3 className="font-display text-xl uppercase">GitHub <span className="font-label text-xs tracking-widest text-muted">→ Code</span></h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(name);
        }}
        className="mt-2 flex gap-2"
      >
        <input aria-label="GitHub username" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your GitHub username" className={fieldClass} />
        <SlashButton type="submit" variant="ghost">Save</SlashButton>
      </form>
      <p className="mt-1 text-xs text-muted">
        {data.username ? `Last synced ${ago(data.lastSyncedAt)}. ` : ""}Commits are grouped per repo per day, each worth{" "}
        {gameConfig.imports.github.minutesPerCommit} minutes of Code.{" "}
        {data.hasToken ? "Private repos included." : "Public repos only. To include private ones, add a read-only GITHUB_TOKEN in Vercel."}
      </p>
      {data.username && (
        <button onClick={() => void save(null)} className="mt-1 font-label text-xs font-extrabold tracking-widest text-muted uppercase hover:text-crimson-text">
          Disconnect
        </button>
      )}
      {msg && <p className="mt-1 text-xs text-volt">{msg}</p>}
    </div>
  );
}

function HealthCard({ data, onChange }: { data: ImportsData["connections"]["health"]; onChange: () => void }) {
  const { backend } = useGame();
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/import/health" : `${window.location.origin}/api/import/health`;
  const make = async () => {
    if (data.hasToken && !window.confirm("Make a new token? The old one stops working, so you'll need to update your Shortcut.")) return;
    try {
      setToken(await backend.createHealthToken());
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't make a token.");
    }
  };
  return (
    <div>
      <h3 className="font-display text-xl uppercase">Apple Health <span className="font-label text-xs tracking-widest text-muted">→ Health page + XP</span></h3>
      <p className="text-xs text-muted">
        An iPhone Shortcut sends your Apple Health data every night: steps, sleep, heart rate, weight and more go to the Health page. Steps, workouts,
        runs, mindful minutes and sleep also arrive here for XP.{" "}
        {data.hasToken ? `Last received ${ago(data.lastSyncedAt)}.` : ""}
      </p>
      {token ? (
        <div className="mt-3 space-y-3 border-l-2 border-volt pl-3 text-sm">
          <p className="font-label text-xs font-extrabold tracking-widest text-volt uppercase">Copy this now: it won&apos;t be shown again</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate bg-ink-3 px-2 py-1 text-xs">{token}</code>
            <Copy text={token} label="Copy token" />
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate bg-ink-3 px-2 py-1 text-xs">{endpoint}</code>
            <Copy text={endpoint} label="Copy URL" />
          </div>
          <HealthShortcutGuide endpoint={endpoint} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-3">
          <SlashButton variant="ghost" onClick={() => void make()}>{data.hasToken ? "Make a new token" : "Set up"}</SlashButton>
          {data.hasToken && (
            <SlashButton variant="ghost" onClick={() => window.confirm("Disconnect Apple Health? The Shortcut will stop working.") && backend.disconnectImport("health").then(onChange)}>
              Disconnect
            </SlashButton>
          )}
        </div>
      )}
      {data.hasToken && !token && (
        <details className="mt-3">
          <summary className="cursor-pointer font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">How to set up the Shortcut</summary>
          <div className="mt-3 border-l-2 border-ink-3 pl-3">
            <HealthShortcutGuide endpoint={endpoint} />
          </div>
        </details>
      )}
      {msg && <p className="mt-1 text-xs text-volt">{msg}</p>}
    </div>
  );
}

export function InboxView() {
  const { data, backend, canEdit, momentumMultiplier, approveImport, adjustPendingImports, isBusy, floatersFor } = useGame();
  const [inbox, setInbox] = useState<ImportsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(() => {
    backend.loadImports().then(
      (r) => {
        setInbox(r);
        adjustPendingImports(r.pending.length - data.pendingImports);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load your inbox."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);

  useEffect(() => {
    if (!canEdit) return;
    load();
  }, [canEdit, load]);

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-8">
        <PageHeader kicker="Imports" title="Inbox" />
        <p className="text-muted">The inbox is private.</p>
      </main>
    );
  }

  const pending = inbox?.pending ?? [];
  const byDay = new Map<string, ImportItem[]>();
  for (const it of pending) byDay.set(it.occurredOn, [...(byDay.get(it.occurredOn) ?? []), it]);

  const decide = async (it: ImportItem, approve: boolean) => {
    if (approve) {
      if (!(await approveImport(it))) return;
    } else {
      try {
        await backend.ignoreImport(it.id);
        adjustPendingImports(-1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't ignore that.");
        return;
      }
    }
    setInbox((cur) => cur && { ...cur, pending: cur.pending.filter((x) => x.id !== it.id), recent: [{ ...it, status: approve ? ("approved" as const) : ("ignored" as const) }, ...cur.recent].slice(0, 20) });
  };

  const approveAll = async () => {
    if (!window.confirm(`Approve all ${pending.length} imports?`)) return;
    setApprovingAll(true);
    // Oldest first, so repeats and momentum are judged in the order things happened.
    for (const it of [...pending].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))) await decide(it, true);
    setApprovingAll(false);
  };

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await backend.syncImports();
      setNotice(r.errors.length ? r.errors.join(" ") : r.added ? `Found ${r.added} new.` : "Nothing new.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const restore = async (it: ImportItem) => {
    try {
      await backend.restoreImport(it.id);
      adjustPendingImports(1);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Imports" title="Inbox">
        <div className="flex flex-wrap gap-2">
          <SlashButton variant="ghost" onClick={() => void sync()} disabled={syncing || !inbox?.ready}>{syncing ? "Syncing…" : "Sync now"}</SlashButton>
          {pending.length > 1 && <SlashButton onClick={() => void approveAll()} disabled={approvingAll}>Approve all ({pending.length})</SlashButton>}
        </div>
      </PageHeader>

      {inbox && !inbox.ready && (
        <p className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">
          Imports need a one-time database update: run <code>supabase/migrations/0006_imports.sql</code> in the Supabase SQL Editor.
        </p>
      )}
      {error && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}
      {notice && <p role="status" className="skew-box mb-6 bg-ink-3 px-6 py-2 text-sm">{notice}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          <Panel title="Waiting" kicker={inbox ? `${pending.length} to review` : "Loading…"}>
            {!inbox ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted">All caught up. New activity from your connected apps shows up here for you to approve.</p>
            ) : (
              <div className="space-y-5">
                {[...byDay].map(([day, items]) => (
                  <section key={day}>
                    <p className="mb-1 font-label text-xs font-extrabold tracking-widest text-muted uppercase">{dayLabel(day, data.today)}</p>
                    <ul className="divide-y divide-ink-3">
                      {items.map((it) => {
                        const { activity, units } = mapImport(it);
                        const xp = scoreEntry(activity, { units, momentumMultiplier: it.occurredOn === data.today ? momentumMultiplier : 1 }).xp;
                        return (
                          <li key={it.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                            <span className="skew-box w-20 shrink-0 bg-ink-3 px-2 py-0.5 text-center font-label text-xs font-extrabold tracking-wider uppercase">
                              {SOURCE_LABEL[it.source] ?? it.source}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{it.title}</span>
                              <span className="block text-xs text-muted">
                                → {activity.name} · {unitLabel(Math.round(units), activity.unit)} · <span className="text-volt">~+{xp} XP</span>
                              </span>
                            </span>
                            <span className="flex gap-2">
                              <SlashButton onClick={() => void decide(it, true)} disabled={isBusy(`import:${it.id}`) || approvingAll}>Approve</SlashButton>
                              <SlashButton variant="ghost" onClick={() => void decide(it, false)} disabled={isBusy(`import:${it.id}`) || approvingAll}>Ignore</SlashButton>
                            </span>
                            {floatersFor(it.id)}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                <p className="text-xs text-muted">XP is worked out when you approve, with the usual rules: repeats that day are worth less, and momentum counts.</p>
              </div>
            )}
          </Panel>
          {inbox && inbox.recent.length > 0 && (
            <Panel title="Decided" kicker="Recent">
              <ul className="divide-y divide-ink-3">
                {inbox.recent.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0 font-label text-xs font-extrabold tracking-wider text-muted uppercase">{SOURCE_LABEL[it.source] ?? it.source}</span>
                    <span className={`min-w-0 flex-1 truncate ${it.status === "ignored" ? "text-muted line-through" : ""}`}>{it.title}</span>
                    <span className={`font-label text-xs font-extrabold tracking-widest uppercase ${it.status === "approved" ? "text-volt" : "text-muted"}`}>{it.status}</span>
                    {it.status === "ignored" && (
                      <button onClick={() => void restore(it)} className="font-label text-xs font-extrabold tracking-widest text-muted uppercase hover:text-paper">
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <Panel title="Connections" kicker="Where imports come from">
          {inbox ? (
            <div className="space-y-6 divide-ink-3">
              <GithubCard data={inbox.connections.github} onChange={load} />
              <HealthCard data={inbox.connections.health} onChange={load} />
              <p className="text-xs text-muted">Nothing counts until you approve it, and the same thing can never be imported twice.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
