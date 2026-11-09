"use client";

import { useCallback, useMemo, useState } from "react";
import { type Activity, gameConfig } from "@/lib/game/config";
import { type LogEntry, type Quest, toDay } from "@/lib/game/types";
import { repeatIndexFor, scoreEntry, summarize } from "@/lib/game/xp";
import { buildSampleEntries, sampleDailies, sampleQuests } from "@/lib/sample-data";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { LevelUpOverlay, type LevelUpEvent } from "./LevelUpOverlay";
import { StatRadar } from "./StatRadar";

const domainLabel = (id: string) => gameConfig.domains.find((d) => d.id === id)?.label ?? id;
const domainGlyph = (id: string) => gameConfig.domains.find((d) => d.id === id)?.glyph ?? "???";
const unitLabel = (n: number, unit = "") => `${n} ${unit}${n === 1 ? "" : "s"}`;

interface Floater {
  key: number;
  slug: string;
  text: string;
}

export default function CharacterSheetPreview() {
  const today = toDay(new Date());
  const [entries, setEntries] = useState<LogEntry[]>(() => buildSampleEntries(new Date()));
  const [quests, setQuests] = useState<Quest[]>(sampleQuests);
  const [dailies, setDailies] = useState<Quest[]>(sampleDailies);
  const [difficulty, setDifficulty] = useState(gameConfig.difficulty.default);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUpEvent | null>(null);

  const summary = useMemo(() => summarize(entries), [entries]);
  const gold = summary.goldEarned;

  /** Adds an entry to the ledger and fires the level-up moment if earned. */
  const addEntry = useCallback(
    (entry: Omit<LogEntry, "id">, floaterSlug: string) => {
      const before = summarize(entries);
      const next = [...entries, { ...entry, id: `local-${Date.now()}` }];
      const after = summarize(next);
      setEntries(next);

      const key = Date.now();
      setFloaters((f) => [...f, { key, slug: floaterSlug, text: `+${entry.xp} XP` }]);
      setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 1100);

      if (after.overall.level > before.overall.level) {
        setLevelUp({ key, scope: "Overall", level: after.overall.level });
      } else if (after.domains[entry.domain].level > before.domains[entry.domain].level) {
        setLevelUp({ key, scope: domainLabel(entry.domain), level: after.domains[entry.domain].level });
      }
    },
    [entries],
  );

  const logActivity = (activity: Activity) => {
    const score = scoreEntry(activity, {
      units: activity.defaultUnits,
      difficulty,
      repeatIndex: repeatIndexFor(entries, activity.slug, today),
    });
    addEntry(
      {
        activitySlug: activity.slug,
        domain: activity.domain,
        units: activity.defaultUnits,
        difficulty,
        xp: score.xp,
        gold: score.gold,
        occurredOn: today,
      },
      activity.slug,
    );
  };

  const grantQuestReward = (quest: Quest) =>
    addEntry(
      { activitySlug: null, questId: quest.id, domain: quest.domain, units: 1, difficulty: 3, xp: quest.xpReward, gold: quest.goldReward, occurredOn: today, note: quest.title },
      quest.id,
    );

  const toggleDaily = (id: string) => {
    const daily = dailies.find((d) => d.id === id);
    if (!daily || daily.doneToday) return; // preview: no undo
    setDailies((ds) => ds.map((d) => (d.id === id ? { ...d, doneToday: true } : d)));
    grantQuestReward(daily);
  };

  const toggleObjective = (questId: string, objectiveId: string) => {
    const quest = quests.find((q) => q.id === questId);
    if (!quest) return;
    const objectives = quest.objectives.map((o) => (o.id === objectiveId ? { ...o, done: !o.done } : o));
    const wasComplete = quest.objectives.every((o) => o.done);
    const nowComplete = objectives.every((o) => o.done);
    setQuests((qs) => qs.map((q) => (q.id === questId ? { ...q, objectives } : q)));
    if (nowComplete && !wasComplete) grantQuestReward(quest);
  };

  const recent = [...entries].reverse().slice(0, 7);
  const activityName = (slug: string | null) => gameConfig.activities.find((a) => a.slug === slug)?.name;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      {levelUp && <LevelUpOverlay event={levelUp} onDone={() => setLevelUp(null)} />}

      <div className="stripes -mx-4 mb-8 px-4 py-1.5 text-center font-label text-xs font-extrabold tracking-[0.12em] sm:text-sm sm:tracking-[0.2em] text-paper uppercase">
        Preview · sample data · nothing is saved yet
      </div>

      {/* ---------- Hero ---------- */}
      <header className="mb-10 grid items-end gap-6 md:grid-cols-[auto_1fr]">
        <div className="relative w-fit">
          <div className="halftone-red skew-box -rotate-3 px-7 pt-3 pb-2 shadow-[8px_8px_0_var(--paper)]">
            <div className="font-label text-lg font-extrabold tracking-[0.25em] text-paper uppercase">Level</div>
            <div className="font-display text-8xl leading-none text-paper drop-shadow-[4px_4px_0_var(--ink)]">
              {summary.overall.level}
            </div>
          </div>
        </div>
        <div>
          <p className="font-label text-base font-semibold tracking-[0.3em] text-crimson uppercase">Life RPG</p>
          <h1 className="font-display text-5xl leading-[0.95] uppercase sm:text-7xl">
            Player <span className="bg-paper px-2 text-ink">One</span>
          </h1>
          <p className="mt-2 font-label text-xl font-semibold tracking-wide text-muted uppercase">Apprentice of many paths</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <XpBar progress={summary.overall.progress} label="Overall level progress" size="lg" />
            </div>
            <div className="font-label text-lg font-extrabold whitespace-nowrap tabular-nums">
              {summary.overall.xpIntoLevel.toLocaleString()} / {summary.overall.xpForNext.toLocaleString()} XP
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 font-label text-lg font-extrabold tracking-wider uppercase">
            <span className="skew-box bg-ink-3 px-4 py-0.5">
              <span className="text-volt">◆ {gold.toLocaleString()}</span> gold
            </span>
            <span className="skew-box bg-ink-3 px-4 py-0.5">{summary.overall.totalXp.toLocaleString()} total XP</span>
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[5fr_7fr]">
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
            <ul className="divide-y divide-ink-3">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="w-12 font-label text-xs font-extrabold tracking-wider text-muted">{domainGlyph(e.domain)}</span>
                  <span className="flex-1 truncate">
                    {activityName(e.activitySlug) ?? e.note}
                    {e.activitySlug && <span className="text-muted"> · {unitLabel(e.units, gameConfig.activities.find((a) => a.slug === e.activitySlug)?.unit)}</span>}
                  </span>
                  <span className="font-label font-extrabold text-crimson tabular-nums">+{e.xp}</span>
                  <span className="w-20 text-right text-xs text-muted tabular-nums">{e.occurredOn === today ? "today" : e.occurredOn.slice(5)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ---------- Right column (first on phones: logging is the daily action) ---------- */}
        <div className="order-first space-y-10 lg:order-none">
          <Panel title="Quick log" kicker="One tap">
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
                  const preview = scoreEntry(a, {
                    units: a.defaultUnits,
                    difficulty,
                    repeatIndex: repeatIndexFor(entries, a.slug, today),
                  });
                  const diminished = preview.breakdown.repeatMultiplier < 1;
                  return (
                    <div key={a.slug} className="relative">
                      <button
                        onClick={() => logActivity(a)}
                        className="group slash-panel flex w-full flex-col items-start bg-ink-3 px-3 pt-2 pb-3 text-left transition-[transform,background-color] duration-100 hover:-translate-y-0.5 hover:bg-crimson active:scale-95"
                      >
                        <span className="font-label text-xs font-extrabold tracking-widest text-muted group-hover:text-paper">
                          {domainGlyph(a.domain)}
                        </span>
                        <span className="font-display text-xl leading-tight uppercase">{a.name}</span>
                        <span className="text-xs text-muted group-hover:text-paper">
                          {unitLabel(a.defaultUnits, a.unit)} ·{" "}
                          <span className={diminished ? "text-volt group-hover:text-paper" : ""}>+{preview.xp} XP</span>
                        </span>
                      </button>
                      {floaters
                        .filter((f) => f.slug === a.slug)
                        .map((f) => (
                          <span
                            key={f.key}
                            className="anim-float-up pointer-events-none absolute top-0 left-1/2 bg-volt px-2 font-display text-xl text-ink"
                          >
                            {f.text}
                          </span>
                        ))}
                    </div>
                  );
                })}
            </div>
            <p className="mt-3 text-xs text-muted">
              Yellow XP means you already did it today, so repeats are worth less.
            </p>
          </Panel>

          <Panel title="Dailies" kicker={today}>
            <ul className="space-y-2">
              {dailies.map((d) => (
                <li key={d.id} className="relative">
                  <button
                    onClick={() => toggleDaily(d.id)}
                    disabled={d.doneToday}
                    className="flex w-full items-center gap-3 py-1 text-left"
                  >
                    <span className={`skew-box grid h-6 w-8 place-items-center font-display text-sm ${d.doneToday ? "bg-crimson" : "bg-ink-3"}`}>
                      {d.doneToday ? "✓" : ""}
                    </span>
                    <span className={`flex-1 ${d.doneToday ? "text-muted line-through" : ""}`}>{d.title}</span>
                    <span className="font-label text-sm font-extrabold text-muted">+{d.xpReward} XP</span>
                  </button>
                  {floaters.filter((f) => f.slug === d.id).map((f) => (
                    <span key={f.key} className="anim-float-up pointer-events-none absolute top-0 left-1/2 bg-volt px-2 font-display text-lg text-ink">
                      {f.text}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Quests" kicker="Active">
            <div className="space-y-6">
              {quests.map((q) => {
                const done = q.objectives.filter((o) => o.done).length;
                const complete = done === q.objectives.length;
                return (
                  <article key={q.id} className="relative">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`skew-box px-3 py-0.5 font-label text-xs font-extrabold tracking-widest uppercase ${
                          q.isBoss ? "bg-volt text-ink" : q.kind === "main" ? "bg-crimson" : "bg-paper text-ink"
                        }`}
                      >
                        {q.isBoss ? "Boss" : q.kind === "main" ? "Main quest" : "Side quest"}
                      </span>
                      <h3 className={`font-display text-2xl uppercase ${complete ? "text-muted line-through" : ""}`}>{q.title}</h3>
                      <span className="ml-auto font-label text-sm font-extrabold text-muted">
                        +{q.xpReward} XP · <span className="text-volt">◆{q.goldReward}</span>
                      </span>
                    </div>
                    {q.isBoss ? (
                      <div className="mb-2 flex items-center gap-3">
                        <span className="font-label text-sm font-extrabold tracking-widest text-volt uppercase">HP</span>
                        <XpBar progress={1 - done / q.objectives.length} label={`${q.title} boss health`} tone="volt" />
                        <span className="font-label font-extrabold tabular-nums">
                          {q.objectives.length - done}/{q.objectives.length}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-2">
                        <XpBar progress={done / q.objectives.length} label={`${q.title} progress`} size="sm" />
                      </div>
                    )}
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {q.objectives.map((o) => (
                        <li key={o.id}>
                          <button onClick={() => toggleObjective(q.id, o.id)} className="flex items-center gap-2 text-left text-sm">
                            <span className={`h-3 w-3 rotate-45 ${o.done ? "bg-crimson" : "border border-muted"}`} />
                            <span className={o.done ? "text-muted line-through" : ""}>{o.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {floaters.filter((f) => f.slug === q.id).map((f) => (
                      <span key={f.key} className="anim-float-up pointer-events-none absolute top-0 left-1/2 bg-volt px-2 font-display text-2xl text-ink">
                        {f.text}
                      </span>
                    ))}
                  </article>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
