"use client";

import Link from "next/link";
import { useState } from "react";
import { quickLogActivities } from "@/lib/game/activities";
import { weekLabel, lastFinishedWeek } from "@/lib/game/recap";
import { ActivityManager } from "../ActivityManager";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { gameConfig } from "@/lib/game/config";
import { activityOf, domainGlyph, unitLabel } from "@/lib/game/format";
import { currentSeason, seasonStats } from "@/lib/game/seasons";
import { scoreEntry } from "@/lib/game/xp";
import { useGame } from "../GameProvider";
import { LockButton } from "../LockButton";
import { QuestEditor } from "../QuestEditor";
import { StreakPanel } from "../StreakPanel";

function Hero() {
  const { data, summary, canEdit, goldBalance, progress, basePath } = useGame();
  const season = currentSeason(data.seasons, data.today);
  const seasonDay = season ? seasonStats(season, [], data.today, [], []) : null;
  return (
    <header className="mb-10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 md:items-end md:gap-x-6">
      <div className="halftone-red skew-box w-fit -rotate-3 px-4 pt-1.5 pb-1 shadow-[5px_5px_0_var(--paper)] md:row-span-2 md:px-7 md:pt-3 md:pb-2 md:shadow-[8px_8px_0_var(--paper)]">
        <div className="font-label text-xs font-extrabold tracking-[0.25em] text-paper uppercase md:text-lg">Level</div>
        <div className="font-display text-6xl leading-none text-paper drop-shadow-[3px_3px_0_var(--ink)] md:text-8xl md:drop-shadow-[4px_4px_0_var(--ink)]">
          {summary.overall.level}
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-label text-sm font-semibold tracking-[0.3em] text-crimson uppercase md:text-base">Life RPG</p>
        <h1 className="font-display text-4xl leading-[0.95] break-words uppercase sm:text-5xl md:text-7xl">{data.displayName}</h1>
        {data.title && <p className="mt-1 font-label text-base font-semibold tracking-wide text-muted uppercase md:mt-2 md:text-xl">{data.title}</p>}
      </div>
      <div className="col-span-2 md:col-span-1 md:col-start-2">
        {data.bio && <p className="mb-3 max-w-2xl text-sm text-muted">{data.bio}</p>}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <XpBar progress={summary.overall.progress} label="Overall level progress" size="lg" />
          </div>
          <div className="font-label text-base font-extrabold whitespace-nowrap tabular-nums md:text-lg">
            {summary.overall.xpIntoLevel.toLocaleString()} / {summary.overall.xpForNext.toLocaleString()} XP
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 font-label text-base font-extrabold tracking-wider uppercase md:gap-3 md:text-lg">
          {canEdit && (
            <span className="skew-box bg-ink-3 px-4 py-0.5">
              <span className="text-volt">◆ {goldBalance.toLocaleString()}</span> gold
            </span>
          )}
          <span className="skew-box bg-ink-3 px-4 py-0.5">{summary.overall.totalXp.toLocaleString()} total XP</span>
          {data.streaksReady && progress.streak > 0 && <span className="skew-box bg-crimson px-4 py-0.5">{progress.streak}-day streak</span>}
          {season && seasonDay && (
            <Link href={`${basePath}/quests`} className="skew-box bg-paper px-4 py-0.5 text-ink hover:bg-volt">
              ★ {season.name} · day {seasonDay.dayNumber}/{seasonDay.totalDays}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function QuickLog() {
  const { data, difficulty, setDifficulty, momentumMultiplier, logActivity, openLogDialog, isBusy, floatersFor } = useGame();
  const [managing, setManaging] = useState(false);
  if (managing)
    return (
      <Panel title="Quick log" kicker="Edit buttons">
        <ActivityManager onDone={() => setManaging(false)} />
      </Panel>
    );
  return (
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
        <button
          onClick={() => setManaging(true)}
          className="ml-auto font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-volt"
          aria-label="Edit quick-log buttons"
        >
          ✎ Edit
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickLogActivities(data.activities).map((a) => {
            const preview = scoreEntry(a, { units: a.defaultUnits, difficulty, repeatIndex: data.todayCounts[a.slug] ?? 0, momentumMultiplier });
            const diminished = preview.breakdown.repeatMultiplier < 1;
            return (
              <div key={a.slug} className="relative">
                <button
                  onClick={() => void logActivity(a)}
                  disabled={isBusy(a.slug)}
                  className="group slash-panel flex w-full flex-col items-start bg-ink-3 px-3 pt-2 pb-3 text-left transition-[transform,background-color] duration-100 hover:-translate-y-0.5 hover:bg-crimson active:scale-95 disabled:opacity-60"
                >
                  <span className="font-label text-xs font-extrabold tracking-widest text-muted group-hover:text-paper">{domainGlyph(a.domain)}</span>
                  <span className="font-display text-xl leading-tight uppercase">{a.name}</span>
                  <span className="text-xs text-muted group-hover:text-paper">
                    {unitLabel(a.defaultUnits, a.unit)} · <span className={diminished ? "text-volt group-hover:text-paper" : ""}>+{preview.xp} XP</span>
                  </span>
                </button>
                <button
                  onClick={() => openLogDialog(a)}
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
  );
}

function Dailies() {
  const { data, canEdit, editing, setEditing, completeDaily, abandonQuest, saveQuest, setQuestPublic, isBusy, floatersFor, basePath } = useGame();
  return (
    <Panel title="Dailies" kicker={data.today}>
      {data.dailies.length === 0 ? (
        <p className="py-2 text-muted">
          No dailies yet.
          {canEdit && (
            <>
              {" "}
              Add one on the <Link href={`${basePath}/quests`} className="underline hover:text-paper">Quests</Link> page.
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.dailies.map((d) =>
            editing === d.id ? (
              <li key={d.id}>
                <QuestEditor
                  quest={d}
                  reward={canEdit && data.extrasReady ? (data.rewards[d.id] ?? "") : undefined}
                  onSave={(edit) => saveQuest(d, edit)}
                  onAddObjective={async () => false}
                  onRemoveObjective={() => {}}
                  onClose={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={d.id} className="relative flex items-center gap-2">
                <button onClick={() => completeDaily(d)} disabled={!canEdit || d.doneToday || isBusy(d.id)} className="flex flex-1 items-center gap-3 py-1 text-left">
                  <span className={`skew-box grid h-6 w-8 place-items-center font-display text-sm ${d.doneToday ? "bg-crimson" : "bg-ink-3"}`}>
                    {d.doneToday ? "✓" : ""}
                  </span>
                  <span className={`min-w-0 flex-1 ${d.doneToday ? "text-muted line-through" : ""}`}>
                    {d.title}
                    {canEdit && data.rewards[d.id] && (
                      <span className="block font-label text-[11px] font-extrabold tracking-widest text-volt uppercase no-underline">
                        ◈ <span className="normal-case tracking-normal">{data.rewards[d.id]}</span>
                      </span>
                    )}
                  </span>
                  <span className="font-label text-sm font-extrabold text-muted">+{d.xpReward} XP</span>
                </button>
                {canEdit && (
                  <>
                    <LockButton isPublic={d.isPublic !== false} onToggle={() => setQuestPublic(d, d.isPublic === false)} disabled={isBusy(`vis:${d.id}`)} what={d.title} />
                    <button onClick={() => setEditing(d.id)} aria-label={`Edit ${d.title}`} className="px-1 text-muted opacity-60 hover:text-paper hover:opacity-100">
                      ✎
                    </button>
                    <button onClick={() => abandonQuest(d)} aria-label={`Remove ${d.title}`} className="px-1 text-muted opacity-60 hover:text-crimson hover:opacity-100">
                      ×
                    </button>
                  </>
                )}
                {floatersFor(d.id, "text-lg")}
              </li>
            ),
          )}
        </ul>
      )}
    </Panel>
  );
}

function RecentLog() {
  const { data, canEdit, removeEntry, setEntryPublic, isBusy } = useGame();
  return (
    <Panel title="Log" kicker="Recent">
      {data.recent.length === 0 ? (
        <p className="py-4 text-muted">Nothing logged yet. Your adventure starts with one tap.</p>
      ) : (
        <ul className="divide-y divide-ink-3">
          {data.recent.map((e) => {
            const a = activityOf(e.activitySlug, data.activities);
            const tag = e.source === "skill" ? "SKL" : e.questId || e.source === "quest" ? "QST" : domainGlyph(e.domain);
            return (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="w-12 font-label text-xs font-extrabold tracking-wider text-muted">{tag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {a?.name ?? e.note ?? "Reward"}
                    {a && <span className="text-muted"> · {unitLabel(e.units, a.unit)}</span>}
                  </span>
                  {a && e.note && <span className="block truncate text-xs text-muted italic">“{e.note}”</span>}
                </span>
                <span className="font-label font-extrabold text-crimson tabular-nums">+{e.xp}</span>
                <span className="w-12 text-right text-xs text-muted tabular-nums">{e.occurredOn === data.today ? "today" : e.occurredOn.slice(5)}</span>
                {canEdit && <LockButton isPublic={e.isPublic !== false} onToggle={() => void setEntryPublic(e, e.isPublic === false)} disabled={isBusy(`vis:${e.id}`)} what={a?.name ?? "This entry"} />}
                {canEdit && (
                  <button
                    onClick={() => window.confirm(`Delete this ${a?.name ?? "entry"} entry and its ${e.xp} XP?`) && removeEntry(e)}
                    disabled={!a || isBusy(`del:${e.id}`)}
                    aria-label={a ? `Delete ${a.name} entry` : "Rewards can't be deleted"}
                    title={a ? "Delete entry" : "Rewards can't be deleted"}
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
  );
}

export function TodayView() {
  const { data, progress, canEdit, toggleRest, isBusy, basePath } = useGame();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <Hero />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          {canEdit && data.pendingImports > 0 && (
            <Link
              href={`${basePath}/inbox`}
              className="skew-box flex items-center gap-3 bg-volt px-6 py-2 font-label font-extrabold tracking-wider text-ink uppercase hover:bg-paper"
            >
              <span className="font-display text-2xl">{data.pendingImports}</span>
              <span className="flex-1">import{data.pendingImports === 1 ? "" : "s"} waiting in your inbox</span>
              <span>Review →</span>
            </Link>
          )}
          {canEdit && data.recapDue && (
            <Link
              href={`${basePath}/journal`}
              className="skew-box flex items-center gap-3 bg-paper px-6 py-2 font-label font-extrabold tracking-wider text-ink uppercase hover:bg-volt"
            >
              <span className="font-display text-2xl">✦</span>
              <span className="flex-1">Your weekly recap for {weekLabel(lastFinishedWeek(data.today))} is ready to write</span>
              <span>Journal →</span>
            </Link>
          )}
          {canEdit && <QuickLog />}
          <Dailies />
        </div>
        <div className="space-y-10">
          <StreakPanel
            progress={progress}
            today={data.today}
            restDays={data.restDays}
            ready={data.streaksReady}
            canEdit={canEdit}
            isBusy={(day) => isBusy(`rest:${day}`)}
            onToggleRest={toggleRest}
          />
          <RecentLog />
        </div>
      </div>
    </main>
  );
}
