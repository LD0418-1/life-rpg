"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { gameConfig } from "@/lib/game/config";
import { monthLabel, monthOf, monthRange, shiftMonth } from "@/lib/game/finance";
import { activityOf, domainGlyph, domainLabel, unitLabel } from "@/lib/game/format";
import { addDays } from "@/lib/game/streaks";
import type { JournalData, LogEntry } from "@/lib/game/types";
import { levelFromXp } from "@/lib/game/xp";
import { useGame } from "../GameProvider";
import { ShareButton } from "../ShareButton";
import { PageHeader } from "./PageHeader";

const longDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const SOURCE_TAG: Record<string, string> = { github: "GitHub", strava: "Strava", health: "Health" };

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2}>
      <rect x="5" y="11" width="14" height="10" />
      <path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </svg>
  );
}

export function JournalView() {
  const { data, backend, canEdit, mode, setEntryPublic, cardHref, summary } = useGame();
  const [range, setRange] = useState<{ kind: "month"; month: string } | { kind: "season"; seasonId: string }>({ kind: "month", month: monthOf(data.today) });
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isVisitor = mode === "visitor";

  const season = range.kind === "season" ? data.seasons.find((s) => s.id === range.seasonId) : null;
  const from = range.kind === "month" ? monthRange(range.month).from : (season?.startsOn ?? data.today);
  const rawTo = range.kind === "month" ? monthRange(range.month).to : (season?.endsOn ?? data.today);
  const to = rawTo > data.today ? data.today : rawTo;

  useEffect(() => {
    let live = true;
    setJournal(null);
    setError(null);
    if (to < from) {
      setJournal({ entries: [], trophies: [], skills: [] });
      return;
    }
    backend.loadJournal(from, to).then(
      (j) => live && setJournal(j),
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load the journal."),
    );
    return () => {
      live = false;
    };
  }, [backend, from, to]);

  // Overall level-ups by day, from the XP per day this viewer can see.
  const levelUps = useMemo(() => {
    const curve = gameConfig.levels.overall;
    const map = new Map<string, number>();
    let total = 0;
    let level = 1;
    for (const d of [...data.days].sort((a, b) => a.day.localeCompare(b.day))) {
      total += d.xp;
      const now = levelFromXp(total, curve).level;
      if (now > level) map.set(d.day, now);
      level = now;
    }
    return map;
  }, [data.days]);

  const byDay = useMemo(() => {
    const map = new Map<string, { entries: LogEntry[]; trophies: string[]; skills: string[] }>();
    const slot = (day: string) => {
      if (!map.has(day)) map.set(day, { entries: [], trophies: [], skills: [] });
      return map.get(day)!;
    };
    for (const e of journal?.entries ?? []) slot(e.occurredOn).entries.push(e);
    for (const t of journal?.trophies ?? []) slot(t.day).trophies.push(ACHIEVEMENTS.find((a) => a.slug === t.slug)?.name ?? t.slug);
    for (const s of journal?.skills ?? []) slot(s.day).skills.push(`${s.name} (${s.tree})`);
    for (const [day] of levelUps) if (day >= from && day <= to) slot(day);
    for (const s of data.seasons) {
      if (s.startsOn >= from && s.startsOn <= to) slot(s.startsOn);
      if (s.endsOn >= from && s.endsOn <= to) slot(s.endsOn);
    }
    return [...map].sort((a, b) => b[0].localeCompare(a[0]));
  }, [journal, levelUps, data.seasons, from, to]);

  // Summary for the range.
  const entries = journal?.entries ?? [];
  const xp = entries.reduce((s, e) => s + e.xp, 0);
  const activeDays = new Set(entries.map((e) => e.occurredOn)).size;
  const byDomain = new Map<string, number>();
  for (const e of entries) byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + e.xp);
  const topDomain = [...byDomain].sort((a, b) => b[1] - a[1])[0]?.[0];
  const questsCleared = entries.filter((e) => e.source === "quest" && e.questId).length;
  const xpBefore = data.days.filter((d) => d.day < from).reduce((s, d) => s + d.xp, 0);
  const curve = gameConfig.levels.overall;
  const levelStart = levelFromXp(xpBefore, curve).level;
  const levelEnd = levelFromXp(xpBefore + data.days.filter((d) => d.day >= from && d.day <= to).reduce((s, d) => s + d.xp, 0), curve).level;
  const isThisMonth = range.kind === "month" && range.month === monthOf(data.today);
  const pastSeasons = data.seasons.filter((s) => s.startsOn <= data.today);

  return (
    <main className="mx-auto max-w-4xl px-4 pt-8">
      <PageHeader kicker="Your story" title="Journal">
        <div className="flex flex-wrap items-center gap-3">
          {range.kind === "month" && (
            <div className="flex items-center gap-2">
              <button onClick={() => setRange({ kind: "month", month: shiftMonth(range.month, -1) })} aria-label="Previous month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson">‹</button>
              <span className="min-w-[10.5rem] text-center font-label text-lg font-extrabold tracking-wider uppercase">{monthLabel(range.month)}</span>
              <button onClick={() => setRange({ kind: "month", month: shiftMonth(range.month, 1) })} disabled={isThisMonth} aria-label="Next month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson disabled:opacity-30">›</button>
            </div>
          )}
          {pastSeasons.length > 0 && (
            <select
              aria-label="Show a month or a season"
              value={range.kind === "season" ? range.seasonId : "month"}
              onChange={(e) => setRange(e.target.value === "month" ? { kind: "month", month: monthOf(data.today) } : { kind: "season", seasonId: e.target.value })}
              className="bg-ink-3 px-3 py-1.5 font-label font-extrabold tracking-wider uppercase outline-none focus:ring-2 focus:ring-crimson"
            >
              <option value="month">By month</option>
              {pastSeasons.map((s) => (
                <option key={s.id} value={s.id}>Season: {s.name}</option>
              ))}
            </select>
          )}
        </div>
      </PageHeader>

      {error && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["XP earned", xp.toLocaleString()],
          ["Active days", String(activeDays)],
          ["Top domain", topDomain ? domainLabel(topDomain) : "—"],
          ["Level", levelEnd > levelStart ? `${levelStart} → ${levelEnd}` : String(levelEnd)],
        ].map(([k, v]) => (
          <div key={k} className="slash-panel bg-ink-2 p-4">
            <div className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">{k}</div>
            <div className="font-display text-3xl leading-tight">{v}</div>
          </div>
        ))}
      </div>
      {questsCleared > 0 && <p className="-mt-6 mb-8 text-sm text-muted">{questsCleared} quest reward{questsCleared === 1 ? "" : "s"} earned in this stretch.</p>}

      {!journal ? (
        <p className="text-muted">Loading…</p>
      ) : byDay.length === 0 ? (
        <Panel title="Quiet">
          <p className="text-sm text-muted">Nothing logged in this stretch.</p>
        </Panel>
      ) : (
        <ol className="relative space-y-8 border-l-4 border-ink-3 pl-6">
          {byDay.map(([day, items]) => {
            const dayXp = items.entries.reduce((s, e) => s + e.xp, 0);
            const lvl = levelUps.get(day);
            const seasonMarks = data.seasons.flatMap((s) => [
              ...(s.startsOn === day ? [`★ ${s.name} began`] : []),
              ...(s.endsOn === day ? [`★ ${s.name} ended`] : []),
            ]);
            return (
              <li key={day} className="relative">
                <span aria-hidden className="absolute top-2 -left-[2.15rem] h-4 w-4 rotate-45 bg-crimson" />
                <div className="mb-2 flex flex-wrap items-baseline gap-3">
                  <h2 className="font-display text-2xl uppercase">{day === data.today ? "Today" : day === addDays(data.today, -1) ? "Yesterday" : longDay(day)}</h2>
                  {dayXp > 0 && <span className="font-label font-extrabold text-crimson">+{dayXp} XP</span>}
                </div>
                {(lvl || seasonMarks.length > 0 || items.trophies.length > 0 || items.skills.length > 0) && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 font-label text-xs font-extrabold tracking-wider uppercase">
                    {lvl && (
                      <span className="skew-box flex items-center gap-2 bg-crimson px-3 py-0.5">
                        Level up → {lvl}
                        {!isVisitor && lvl <= summary.overall.level && (
                          <ShareButton href={`${cardHref({ type: "level", level: lvl })}${mode === "preview" ? "" : `&level=${lvl}`}`} filename={`level-${lvl}.png`} title={`Level ${lvl}`} label="Share" className="!px-2 !py-0 !text-xs" />
                        )}
                      </span>
                    )}
                    {seasonMarks.map((m) => (
                      <span key={m} className="skew-box bg-paper px-3 py-0.5 text-ink">{m}</span>
                    ))}
                    {items.trophies.map((t) => (
                      <span key={t} className="skew-box bg-volt px-3 py-0.5 text-ink">★ {t}</span>
                    ))}
                    {items.skills.map((s) => (
                      <span key={s} className="skew-box border-2 border-paper px-3 py-0.5">Skill: {s}</span>
                    ))}
                  </div>
                )}
                {items.entries.length > 0 && (
                  <ul className="slash-panel divide-y divide-ink-3 bg-ink-2 px-4">
                    {items.entries.map((e) => {
                      const a = activityOf(e.activitySlug);
                      const tag = e.source && SOURCE_TAG[e.source] ? SOURCE_TAG[e.source] : e.source === "skill" ? "Skill" : e.source === "quest" ? "Quest" : domainGlyph(e.domain);
                      const isPrivate = e.isPublic === false;
                      return (
                        <li key={e.id} className="flex items-center gap-3 py-2">
                          <span className="w-14 shrink-0 font-label text-[11px] font-extrabold tracking-wider text-muted uppercase">{tag}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {e.source === "quest" ? `Cleared: ${e.note ?? "a quest"}` : (a?.name ?? e.note ?? "Reward")}
                              {a && <span className="text-muted"> · {unitLabel(Math.round(e.units), a.unit)}</span>}
                            </span>
                            {a && e.note && e.source === "manual" && <span className="block truncate text-xs text-muted italic">“{e.note}”</span>}
                            {a && e.note && e.source && SOURCE_TAG[e.source] && <span className="block truncate text-xs text-muted">{e.note}</span>}
                          </span>
                          <span className="font-label font-extrabold text-crimson tabular-nums">+{e.xp}</span>
                          {canEdit && (
                            <button
                              onClick={() =>
                                void setEntryPublic(e, isPrivate).then((okay) => okay && setJournal((j) => j && { ...j, entries: j.entries.map((x) => (x.id === e.id ? { ...x, isPublic: isPrivate } : x)) }))
                              }
                              aria-label={isPrivate ? "Private: only you see this. Tap to make it public." : "Public. Tap to make it private."}
                              title={isPrivate ? "Private (only you)" : "Public"}
                              className={`p-1 ${isPrivate ? "text-volt" : "text-muted opacity-50 hover:opacity-100"}`}
                            >
                              <LockIcon open={!isPrivate} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canEdit && <p className="mt-8 text-xs text-muted">The lock on each entry makes it private: visitors won&apos;t see it or count its XP.</p>}
    </main>
  );
}
