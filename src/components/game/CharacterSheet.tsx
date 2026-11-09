"use client";

import { type ReactNode, useMemo, useState } from "react";
import { type Activity, gameConfig } from "@/lib/game/config";
import type { LogEntry, LogOptions, Quest, QuestEdit, SheetBackend, SheetData } from "@/lib/game/types";
import { computeProgress } from "@/lib/game/streaks";
import { addToTotals, detectLevelUp, scoreEntry, summarizeTotals } from "@/lib/game/xp";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { LevelUpOverlay, type LevelUpEvent } from "./LevelUpOverlay";
import { LogDialog } from "./LogDialog";
import { NewQuestForm } from "./NewQuestForm";
import { QuestEditor } from "./QuestEditor";
import { StatRadar } from "./StatRadar";
import { StreakPanel } from "./StreakPanel";

export type SheetMode = "preview" | "owner" | "visitor";

const domainLabel = (id: string) => gameConfig.domains.find((d) => d.id === id)?.label ?? id;
const domainGlyph = (id: string) => gameConfig.domains.find((d) => d.id === id)?.glyph ?? "???";
const unitLabel = (n: number, unit = "") => `${n} ${unit}${n === 1 ? "" : "s"}`;
const activityOf = (slug: string | null) => gameConfig.activities.find((a) => a.slug === slug);

/** Adds `xp` to `day` in a list of daily totals (drops days that reach 0). */
function addDayXp(days: SheetData["days"], day: string, xp: number): SheetData["days"] {
  const found = days.some((d) => d.day === day);
  const next = found ? days.map((d) => (d.day === day ? { ...d, xp: d.xp + xp } : d)) : [...days, { day, xp }];
  return next.filter((d) => d.xp > 0);
}

interface Floater {
  key: number;
  target: string;
  text: string;
}

export function CharacterSheet({
  initial,
  backend,
  mode,
  toolbar,
  footer,
}: {
  initial: SheetData;
  backend: SheetBackend;
  mode: SheetMode;
  /** Small links at the top (e.g. Settings, Log out). */
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  const [data, setData] = useState<SheetData>(initial);
  const [difficulty, setDifficulty] = useState(gameConfig.difficulty.default);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUpEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dialogFor, setDialogFor] = useState<Activity | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ key: number; entry: LogEntry } | null>(null);
  const [banner, setBanner] = useState<{ key: number; title: string; sub: string } | null>(null);
  const canEdit = mode !== "visitor";
  const summary = summarizeTotals(data.totals);
  const progress = useMemo(() => computeProgress(data.days, data.restDays, data.today), [data.days, data.restDays, data.today]);
  const momentumMultiplier = data.streaksReady ? progress.xpMultiplier : 1;

  /** Runs a backend call with a busy flag on `key` and error reporting. */
  async function act<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.has(key)) return;
    setBusy((b) => new Set(b).add(key));
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  }

  /** Adds a saved ledger entry to the screen, with the +XP pop and level-up check. */
  function applyEntry(entry: LogEntry, target: string) {
    const up = detectLevelUp(data.totals, entry);
    if (data.streaksReady) {
      const after = computeProgress(addDayXp(data.days, entry.occurredOn, entry.xp), data.restDays, data.today);
      const key = Date.now();
      if (after.shields > progress.shields) setBanner({ key, title: "Shield earned!", sub: `${after.streak}-day streak · a missed day won't break it` });
      else if (after.streak > progress.streak) setBanner({ key, title: `Streak ×${after.streak}`, sub: after.streak === 1 ? "Day one. Keep it going." : "Today counts." });
      setTimeout(() => setBanner((b) => (b?.key === key ? null : b)), 2200);
    }
    setData((d) => ({
      ...d,
      days: addDayXp(d.days, entry.occurredOn, entry.xp),
      totals: addToTotals(d.totals, [entry]),
      recent: [entry, ...d.recent].slice(0, 10),
      todayCounts: entry.activitySlug
        ? { ...d.todayCounts, [entry.activitySlug]: (d.todayCounts[entry.activitySlug] ?? 0) + 1 }
        : d.todayCounts,
    }));
    const key = Date.now() + Math.random();
    setFloaters((f) => [...f, { key, target, text: `+${entry.xp} XP` }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 1100);
    if (up) setLevelUp({ key, scope: up.scope === "overall" ? "Overall" : domainLabel(up.scope), level: up.level });
  }

  /** Logs an activity. Returns true when saved (the dialog uses it to close). */
  const logActivity = async (a: Activity, options: LogOptions = { difficulty }) => {
    const saved = await act(a.slug, async () => {
      const entry = await backend.logActivity(a.slug, options);
      applyEntry(entry, a.slug);
      const key = Date.now();
      setUndo({ key, entry });
      setTimeout(() => setUndo((u) => (u?.key === key ? null : u)), 6000);
      return true as const;
    });
    return saved === true;
  };

  /** Deletes a logged activity and takes its XP back off the screen. */
  const removeEntry = (entry: LogEntry) =>
    act(`del:${entry.id}`, async () => {
      await backend.deleteEntry(entry.id);
      setUndo((u) => (u?.entry.id === entry.id ? null : u));
      setData((d) => {
        const counts = { ...d.todayCounts };
        if (entry.activitySlug && entry.occurredOn === d.today) counts[entry.activitySlug] = Math.max(0, (counts[entry.activitySlug] ?? 1) - 1);
        return {
          ...d,
          totals: addToTotals(d.totals, [{ domain: entry.domain, xp: -entry.xp, gold: -entry.gold }]),
          days: addDayXp(d.days, entry.occurredOn, -entry.xp),
          recent: d.recent.filter((e) => e.id !== entry.id),
          todayCounts: counts,
        };
      });
    });

  const toggleRest = (day: string, isRest: boolean) =>
    act(`rest:${day}`, async () => {
      if (isRest) await backend.unplanRest(day);
      else await backend.planRest(day);
      setData((d) => ({ ...d, restDays: isRest ? d.restDays.filter((r) => r !== day) : [...d.restDays, day] }));
    });

  const replaceQuest = (q: Quest) =>
    setData((d) => ({
      ...d,
      quests: d.quests.map((x) => (x.id === q.id ? q : x)),
      dailies: d.dailies.map((x) => (x.id === q.id ? { ...q, doneToday: x.doneToday } : x)),
    }));

  const saveQuest = async (q: Quest, edit: QuestEdit) =>
    (await act(`edit:${q.id}`, async () => {
      replaceQuest(await backend.updateQuest(q.id, edit));
      return true as const;
    })) === true;

  const addObjective = async (q: Quest, title: string) =>
    (await act(`add:${q.id}`, async () => {
      replaceQuest(await backend.addObjective(q.id, title));
      return true as const;
    })) === true;

  const removeObjective = (q: Quest, objectiveId: string) =>
    act(`rm:${objectiveId}`, async () => replaceQuest(await backend.removeObjective(q.id, objectiveId)));

  const editButton = (q: Quest) =>
    canEdit && !q.completed ? (
      <button
        onClick={() => setEditing(editing === q.id ? null : q.id)}
        aria-label={`Edit ${q.title}`}
        aria-expanded={editing === q.id}
        className="px-1 text-muted opacity-60 hover:text-paper hover:opacity-100"
      >
        ✎
      </button>
    ) : null;

  const completeDaily = (q: Quest) =>
    act(q.id, async () => {
      const entry = await backend.completeDaily(q.id);
      setData((d) => ({ ...d, dailies: d.dailies.map((x) => (x.id === q.id ? { ...x, doneToday: true } : x)) }));
      if (entry) applyEntry(entry, q.id);
    });

  const toggleObjective = (q: Quest, objectiveId: string, done: boolean) =>
    act(`${q.id}:${objectiveId}`, async () => {
      const reward = await backend.setObjective(q.id, objectiveId, done);
      setData((d) => ({
        ...d,
        quests: d.quests.map((x) =>
          x.id === q.id
            ? { ...x, completed: Boolean(reward), objectives: x.objectives.map((o) => (o.id === objectiveId ? { ...o, done } : o)) }
            : x,
        ),
      }));
      if (reward) applyEntry(reward, q.id);
    });

  const abandonQuest = (q: Quest) => {
    if (!window.confirm(`Abandon "${q.title}"? It disappears from your quest log.`)) return;
    act(q.id, async () => {
      await backend.abandonQuest(q.id);
      setData((d) => ({ ...d, quests: d.quests.filter((x) => x.id !== q.id), dailies: d.dailies.filter((x) => x.id !== q.id) }));
    });
  };

  const floatersFor = (target: string, size = "text-xl") =>
    floaters
      .filter((f) => f.target === target)
      .map((f) => (
        <span key={f.key} className={`anim-float-up pointer-events-none absolute top-0 left-1/2 bg-volt px-2 font-display text-ink ${size}`}>
          {f.text}
        </span>
      ));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      {levelUp && <LevelUpOverlay event={levelUp} onDone={() => setLevelUp(null)} />}

      {mode === "preview" ? (
        <div className="stripes -mx-4 mb-8 px-4 py-1.5 text-center font-label text-xs font-extrabold tracking-[0.12em] text-paper uppercase sm:text-sm sm:tracking-[0.2em]">
          Preview · sample data · nothing is saved
        </div>
      ) : (
        <div className="h-8" />
      )}

      {toolbar && (
        <nav className="-mt-4 mb-6 flex items-center justify-end gap-5 font-label text-sm font-extrabold tracking-widest text-muted uppercase">
          {toolbar}
        </nav>
      )}

      {banner && (
        <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(1.5rem+env(safe-area-inset-top))] z-50 flex justify-center px-4">
          <div key={banner.key} className="anim-stamp anim-fade-out skew-box bg-volt px-8 py-2 text-center text-ink shadow-[6px_6px_0_var(--ink)]">
            <div className="font-display text-3xl uppercase">{banner.title}</div>
            <div className="font-label text-sm font-extrabold tracking-wider uppercase">{banner.sub}</div>
          </div>
        </div>
      )}

      {dialogFor && (
        <LogDialog
          activity={dialogFor}
          momentumMultiplier={momentumMultiplier}
          initialDifficulty={difficulty}
          repeatIndex={data.todayCounts[dialogFor.slug] ?? 0}
          onSubmit={(options) => logActivity(dialogFor, options)}
          onClose={() => setDialogFor(null)}
        />
      )}

      <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl flex-col gap-3">
        {undo && (
          <div className="skew-box flex items-center gap-3 bg-ink-3 px-6 py-3 shadow-[5px_5px_0_var(--crimson)]">
            <span className="flex-1 text-sm">
              Logged <strong>{activityOf(undo.entry.activitySlug)?.name}</strong> · +{undo.entry.xp} XP
            </span>
            <button
              onClick={() => removeEntry(undo.entry)}
              className="font-label font-extrabold tracking-widest text-volt uppercase hover:text-paper"
            >
              Undo
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="skew-box flex items-center gap-3 bg-paper px-6 py-3 text-ink shadow-[5px_5px_0_var(--crimson)]">
            <span className="font-label font-extrabold tracking-wider text-crimson uppercase">Error</span>
            <span className="flex-1 text-sm">{error}</span>
            <button onClick={() => setError(null)} className="font-display text-xl" aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
      </div>

      {/* ---------- Hero ---------- */}
      <header className="mb-10 grid items-end gap-6 md:grid-cols-[auto_1fr]">
        <div className="halftone-red skew-box w-fit -rotate-3 px-7 pt-3 pb-2 shadow-[8px_8px_0_var(--paper)]">
          <div className="font-label text-lg font-extrabold tracking-[0.25em] text-paper uppercase">Level</div>
          <div className="font-display text-8xl leading-none text-paper drop-shadow-[4px_4px_0_var(--ink)]">{summary.overall.level}</div>
        </div>
        <div>
          <p className="font-label text-base font-semibold tracking-[0.3em] text-crimson uppercase">Life RPG</p>
          <h1 className="font-display text-5xl leading-[0.95] break-words uppercase sm:text-7xl">{data.displayName}</h1>
          {data.title && <p className="mt-2 font-label text-xl font-semibold tracking-wide text-muted uppercase">{data.title}</p>}
          {data.bio && <p className="mt-2 max-w-2xl text-sm text-muted">{data.bio}</p>}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <XpBar progress={summary.overall.progress} label="Overall level progress" size="lg" />
            </div>
            <div className="font-label text-lg font-extrabold whitespace-nowrap tabular-nums">
              {summary.overall.xpIntoLevel.toLocaleString()} / {summary.overall.xpForNext.toLocaleString()} XP
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 font-label text-lg font-extrabold tracking-wider uppercase">
            {canEdit && (
              <span className="skew-box bg-ink-3 px-4 py-0.5">
                <span className="text-volt">◆ {summary.goldEarned.toLocaleString()}</span> gold
              </span>
            )}
            <span className="skew-box bg-ink-3 px-4 py-0.5">{summary.overall.totalXp.toLocaleString()} total XP</span>
            {data.streaksReady && progress.streak > 0 && (
              <span className="skew-box bg-crimson px-4 py-0.5">{progress.streak}-day streak</span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---------- Left column ---------- */}
        <div className="space-y-10">
          <Panel title="Stats" kicker="Domain levels">
            <StatRadar
              stats={gameConfig.domains.map((d) => ({
                id: d.id,
                label: d.label,
                level: summary.domains[d.id].level,
                totalXp: summary.domains[d.id].totalXp,
              }))}
            />
            <ul className="mt-4 space-y-3">
              {gameConfig.domains.map((d) => {
                const s = summary.domains[d.id];
                return (
                  <li key={d.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
                    <span className="skew-box bg-paper py-0.5 text-center font-label text-sm font-extrabold text-ink">{d.glyph}</span>
                    <div>
                      <div className="mb-1 flex justify-between font-label text-base font-extrabold tracking-wider uppercase">
                        <span>{d.label}</span>
                        <span className="text-muted tabular-nums">
                          {s.xpIntoLevel} / {s.xpForNext}
                        </span>
                      </div>
                      <XpBar progress={s.progress} label={`${d.label} progress`} size="sm" />
                    </div>
                    <span className="w-14 text-right font-display text-2xl">Lv {s.level}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Log" kicker="Recent">
            {data.recent.length === 0 ? (
              <p className="py-4 text-muted">Nothing logged yet. Your adventure starts with one tap.</p>
            ) : (
              <ul className="divide-y divide-ink-3">
                {data.recent.map((e) => {
                  const a = activityOf(e.activitySlug);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span className="w-12 font-label text-xs font-extrabold tracking-wider text-muted">
                        {e.questId ? "QST" : domainGlyph(e.domain)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {a?.name ?? e.note ?? "Quest reward"}
                          {a && <span className="text-muted"> · {unitLabel(e.units, a.unit)}</span>}
                        </span>
                        {a && e.note && <span className="block truncate text-xs text-muted italic">“{e.note}”</span>}
                      </span>
                      <span className="font-label font-extrabold text-crimson tabular-nums">+{e.xp}</span>
                      <span className="w-12 text-right text-xs text-muted tabular-nums">
                        {e.occurredOn === data.today ? "today" : e.occurredOn.slice(5)}
                      </span>
                      {canEdit && (
                        <button
                          onClick={() => window.confirm(`Delete this ${a?.name ?? "entry"} entry and its ${e.xp} XP?`) && removeEntry(e)}
                          disabled={!a || busy.has(`del:${e.id}`)}
                          aria-label={a ? `Delete ${a.name} entry` : "Quest rewards can't be deleted"}
                          title={a ? "Delete entry" : "Quest rewards can't be deleted"}
                          className="w-5 text-muted opacity-60 hover:text-crimson hover:opacity-100 disabled:invisible"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* ---------- Right column (first on phones: logging is the daily action) ---------- */}
        <div className="order-first space-y-10 lg:order-none">
          {canEdit && (
            <Panel title="Quick log" kicker="Tap · ⋯ for details">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 font-label text-sm font-extrabold tracking-widest text-muted uppercase">Difficulty</span>
                {Object.entries(gameConfig.difficulty.labels).map(([level, label]) => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(Number(level))}
                    aria-pressed={difficulty === Number(level)}
                    className={`skew-box px-3 py-0.5 font-label text-sm font-extrabold tracking-wider uppercase transition-colors ${
                      difficulty === Number(level) ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gameConfig.activities
                  .filter((a) => a.quick)
                  .map((a) => {
                    const preview = scoreEntry(a, { units: a.defaultUnits, difficulty, repeatIndex: data.todayCounts[a.slug] ?? 0, momentumMultiplier });
                    const diminished = preview.breakdown.repeatMultiplier < 1;
                    return (
                      <div key={a.slug} className="relative">
                        <button
                          onClick={() => logActivity(a)}
                          disabled={busy.has(a.slug)}
                          className="group slash-panel flex w-full flex-col items-start bg-ink-3 px-3 pt-2 pb-3 text-left transition-[transform,background-color] duration-100 hover:-translate-y-0.5 hover:bg-crimson active:scale-95 disabled:opacity-60"
                        >
                          <span className="font-label text-xs font-extrabold tracking-widest text-muted group-hover:text-paper">{domainGlyph(a.domain)}</span>
                          <span className="font-display text-xl leading-tight uppercase">{a.name}</span>
                          <span className="text-xs text-muted group-hover:text-paper">
                            {unitLabel(a.defaultUnits, a.unit)} ·{" "}
                            <span className={diminished ? "text-volt group-hover:text-paper" : ""}>+{preview.xp} XP</span>
                          </span>
                        </button>
                        <button
                          onClick={() => setDialogFor(a)}
                          aria-label={`Log ${a.name} with amount and note`}
                          className="absolute top-0 right-0 px-3 py-1 font-display text-lg leading-none text-muted hover:text-paper"
                        >
                          ⋯
                        </button>
                        {floatersFor(a.slug)}
                      </div>
                    );
                  })}
              </div>
              <p className="mt-3 text-xs text-muted">Yellow XP means you already did it today, so repeats are worth less. Tap ⋯ to log a custom amount or add a note.</p>
            </Panel>
          )}

          <StreakPanel
            progress={progress}
            today={data.today}
            restDays={data.restDays}
            ready={data.streaksReady}
            canEdit={canEdit}
            isBusy={(day) => busy.has(`rest:${day}`)}
            onToggleRest={toggleRest}
          />

          <Panel title="Dailies" kicker={data.today}>
            {data.dailies.length === 0 ? (
              <p className="py-2 text-muted">No dailies yet.{canEdit && " Add one below."}</p>
            ) : (
              <ul className="space-y-2">
                {data.dailies.map((d) =>
                  editing === d.id ? (
                    <li key={d.id}>
                      <QuestEditor
                        quest={d}
                        onSave={(edit) => saveQuest(d, edit)}
                        onAddObjective={async () => false}
                        onRemoveObjective={() => {}}
                        onClose={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                  <li key={d.id} className="group/daily relative flex items-center gap-2">
                    <button
                      onClick={() => completeDaily(d)}
                      disabled={!canEdit || d.doneToday || busy.has(d.id)}
                      className="flex flex-1 items-center gap-3 py-1 text-left"
                    >
                      <span className={`skew-box grid h-6 w-8 place-items-center font-display text-sm ${d.doneToday ? "bg-crimson" : "bg-ink-3"}`}>
                        {d.doneToday ? "✓" : ""}
                      </span>
                      <span className={`flex-1 ${d.doneToday ? "text-muted line-through" : ""}`}>{d.title}</span>
                      <span className="font-label text-sm font-extrabold text-muted">+{d.xpReward} XP</span>
                    </button>
                    {editButton(d)}
                    {canEdit && (
                      <button onClick={() => abandonQuest(d)} aria-label={`Remove ${d.title}`} className="px-1 text-muted opacity-60 hover:text-crimson hover:opacity-100">
                        ×
                      </button>
                    )}
                    {floatersFor(d.id, "text-lg")}
                  </li>
                  ),
                )}
              </ul>
            )}
          </Panel>

          <Panel title="Quests" kicker="Active">
            {data.quests.length === 0 ? (
              <p className="py-2 text-muted">No active quests.{canEdit && " Start one below."}</p>
            ) : (
              <div className="space-y-6">
                {data.quests.map((q) => {
                  const done = q.objectives.filter((o) => o.done).length;
                  const total = Math.max(1, q.objectives.length);
                  return (
                    <article key={q.id} className="relative">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`skew-box px-3 py-0.5 font-label text-xs font-extrabold tracking-widest uppercase ${
                            q.isBoss ? "bg-volt text-ink" : q.kind === "main" ? "bg-crimson" : "bg-paper text-ink"
                          }`}
                        >
                          {q.completed ? "Cleared!" : q.isBoss ? "Boss" : q.kind === "main" ? "Main quest" : "Side quest"}
                        </span>
                        <h3 className={`font-display text-2xl uppercase ${q.completed ? "text-muted line-through" : ""}`}>{q.title}</h3>
                        <span className="ml-auto font-label text-sm font-extrabold text-muted">
                          +{q.xpReward} XP{canEdit && <> · <span className="text-volt">◆{q.goldReward}</span></>}
                        </span>
                        {editButton(q)}
                        {canEdit && !q.completed && (
                          <button onClick={() => abandonQuest(q)} aria-label={`Abandon ${q.title}`} className="px-1 text-muted opacity-60 hover:text-crimson hover:opacity-100">
                            ×
                          </button>
                        )}
                      </div>
                      {editing === q.id ? (
                        <QuestEditor
                          quest={q}
                          onSave={(edit) => saveQuest(q, edit)}
                          onAddObjective={(title) => addObjective(q, title)}
                          onRemoveObjective={(objectiveId) => removeObjective(q, objectiveId)}
                          onClose={() => setEditing(null)}
                        />
                      ) : (
                      <>
                      {q.isBoss ? (
                        <div className="mb-2 flex items-center gap-3">
                          <span className="font-label text-sm font-extrabold tracking-widest text-volt uppercase">HP</span>
                          <XpBar progress={1 - done / total} label={`${q.title} boss health`} tone="volt" />
                          <span className="font-label font-extrabold tabular-nums">
                            {q.objectives.length - done}/{q.objectives.length}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-2">
                          <XpBar progress={done / total} label={`${q.title} progress`} size="sm" />
                        </div>
                      )}
                      <ul className="grid gap-1 sm:grid-cols-2">
                        {q.objectives.map((o) => (
                          <li key={o.id}>
                            <button
                              onClick={() => toggleObjective(q, o.id, !o.done)}
                              disabled={!canEdit || q.completed || busy.has(`${q.id}:${o.id}`)}
                              className="flex items-center gap-2 text-left text-sm"
                            >
                              <span className={`h-3 w-3 shrink-0 rotate-45 ${o.done ? "bg-crimson" : "border border-muted"}`} />
                              <span className={o.done ? "text-muted line-through" : ""}>{o.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      </>
                      )}
                      {floatersFor(q.id, "text-2xl")}
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          {canEdit && (
            <NewQuestForm
              onCreate={(input) =>
                act("new-quest", async () => {
                  const quest = await backend.createQuest(input);
                  setData((d) => (quest.kind === "daily" ? { ...d, dailies: [...d.dailies, quest] } : { ...d, quests: [...d.quests, quest] }));
                  return true as const;
                })
              }
            />
          )}
        </div>
      </div>

      {footer && <footer className="mt-16 flex justify-center gap-4 text-sm text-muted">{footer}</footer>}
    </main>
  );
}
