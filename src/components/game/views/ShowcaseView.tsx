"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { gameConfig } from "@/lib/game/config";
import { activityOf, domainGlyph, unitLabel } from "@/lib/game/format";
import { currentSeason, seasonStats } from "@/lib/game/seasons";
import type { Section } from "@/lib/game/visibility";
import { REGIONS } from "@/lib/game/world";
import { useGame } from "../GameProvider";
import { ShareButton } from "../ShareButton";
import { StatRadar } from "../StatRadar";
import { WorldMap } from "../WorldMap";

/** Your public page: what visitors land on. Only shows sections you allow (Settings → What visitors see). */
export function ShowcaseView() {
  const { data, mode, summary, progress, basePath, cardHref } = useGame();
  const [copied, setCopied] = useState(false);
  const isVisitor = mode === "visitor";
  const show = (s: Section) => !isVisitor || data.visibility.sections[s];
  const hidden = (domain: string) => isVisitor && data.visibility.hiddenDomains.includes(domain);
  const domains = gameConfig.domains.filter((d) => !hidden(d.id));
  const season = show("seasons") ? currentSeason(data.seasons, data.today) : null;
  const seasonInfo = season
    ? seasonStats(
        season,
        data.days,
        data.today,
        data.completedOn,
        [...data.quests.filter((q) => q.seasonId === season.id).map((q) => ({ done: Boolean(q.completed) })), ...data.closedSeasonGoals.filter((g) => g.seasonId === season.id).map((g) => ({ done: g.status === "completed" }))],
      )
    : null;
  const trophies = ACHIEVEMENTS.filter((a) => data.achievements.unlocked[a.slug]).sort((a, b) => data.achievements.unlocked[b.slug].localeCompare(data.achievements.unlocked[a.slug]));
  const bigQuests = data.quests.filter((q) => (q.isBoss || q.kind === "main") && !q.completed).slice(0, 4);
  const levels = Object.fromEntries(REGIONS.map((r) => [r.domain, hidden(r.domain) ? 1 : (summary.domains[r.domain]?.level ?? 1)]));

  const copyLink = () => {
    const url = basePath === "/showcase" || basePath === "/preview" ? window.location.origin : window.location.href;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      {/* ---------- Hero ---------- */}
      <header className="mb-12 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-5 md:items-end md:gap-x-8">
        <div className="halftone-red skew-box w-fit -rotate-3 px-5 pt-2 pb-1 shadow-[6px_6px_0_var(--paper)] md:row-span-2 md:px-8 md:pt-4 md:pb-2 md:shadow-[10px_10px_0_var(--paper)]">
          <div className="font-label text-sm font-extrabold tracking-[0.25em] text-paper uppercase md:text-xl">Level</div>
          <div className="font-display text-7xl leading-none text-paper drop-shadow-[4px_4px_0_var(--ink)] md:text-9xl">{summary.overall.level}</div>
        </div>
        <div className="min-w-0">
          <p className="font-label text-sm font-semibold tracking-[0.3em] text-crimson uppercase md:text-base">Life RPG</p>
          <h1 className="font-display text-5xl leading-[0.92] break-words uppercase sm:text-6xl md:text-8xl">{data.displayName}</h1>
          {data.title && <p className="mt-2 font-label text-lg font-semibold tracking-wide text-muted uppercase md:text-2xl">{data.title}</p>}
        </div>
        <div className="col-span-2 md:col-span-1 md:col-start-2">
          {data.bio && <p className="mb-4 max-w-2xl text-base text-muted">{data.bio}</p>}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <XpBar progress={summary.overall.progress} label="Level progress" size="lg" />
            </div>
            <span className="font-label text-base font-extrabold whitespace-nowrap tabular-nums md:text-lg">
              {summary.overall.xpIntoLevel.toLocaleString()} / {summary.overall.xpForNext.toLocaleString()} XP
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 font-label text-base font-extrabold tracking-wider uppercase md:gap-3 md:text-lg">
            <span className="skew-box bg-ink-3 px-4 py-0.5">{summary.overall.totalXp.toLocaleString()} total XP</span>
            {show("streak") && data.streaksReady && progress.streak > 0 && <span className="skew-box bg-crimson px-4 py-0.5">{progress.streak}-day streak</span>}
            {show("trophies") && <span className="skew-box bg-volt px-4 py-0.5 text-ink">{trophies.length} trophies</span>}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {!isVisitor && <ShareButton href={cardHref({ type: "profile" })} filename="life-rpg.png" title={`${data.displayName} · Life RPG`} label="Share my card" />}
            <button onClick={copyLink} className="skew-box bg-ink-3 px-5 py-1.5 font-label text-base font-extrabold tracking-wider uppercase hover:bg-crimson">
              {copied ? "Link copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-2">
        <Panel title="Stats" kicker="Domain levels">
          <StatRadar stats={domains.map((d) => ({ id: d.id, label: d.label, level: summary.domains[d.id].level, totalXp: summary.domains[d.id].totalXp }))} />
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {gameConfig.domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 border-b border-ink-3 py-1">
                <span className="font-label font-extrabold tracking-wider uppercase">{d.label}</span>
                <span className={hidden(d.id) ? "text-sm text-muted" : "font-display text-2xl"}>{hidden(d.id) ? "Hidden" : `Lv ${summary.domains[d.id].level}`}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-10">
          {show("streak") && data.streaksReady && (
            <Panel title="Streak" kicker="Consistency">
              <div className="flex flex-wrap items-end gap-8">
                <div>
                  <div className="font-display text-7xl leading-none tabular-nums">{progress.streak}</div>
                  <div className="font-label text-sm font-extrabold tracking-widest text-crimson uppercase">Day streak</div>
                </div>
                <div>
                  <div className="font-display text-4xl leading-none tabular-nums">{progress.bestStreak}</div>
                  <div className="font-label text-sm font-extrabold tracking-widest text-muted uppercase">Best</div>
                </div>
                <div className="min-w-[10rem] flex-1">
                  <div className="mb-1 flex justify-between font-label text-sm font-extrabold tracking-widest uppercase">
                    <span className="text-muted">Momentum</span>
                    <span>{Math.round(progress.momentum)}</span>
                  </div>
                  <XpBar progress={progress.momentum / 100} label="Momentum" size="sm" />
                </div>
              </div>
            </Panel>
          )}
          {season && seasonInfo && (
            <Panel title="Season" kicker={`Day ${seasonInfo.dayNumber} of ${seasonInfo.totalDays}`}>
              <div className="flex items-center gap-5">
                <span className={`skew-box grid h-16 w-16 shrink-0 place-items-center font-display text-5xl ${seasonInfo.rank === "S" ? "bg-volt text-ink" : "bg-crimson"}`}>{seasonInfo.rank}</span>
                <div className="min-w-0">
                  <h2 className="font-display text-3xl leading-tight break-words uppercase">{season.name}</h2>
                  <p className="text-sm text-muted">
                    {seasonInfo.xp.toLocaleString()} XP · {seasonInfo.activeDays} active days · goals {seasonInfo.goalsDone}/{seasonInfo.goalsTotal}
                  </p>
                </div>
              </div>
            </Panel>
          )}
          {show("quests") && bigQuests.length > 0 && (
            <Panel title="Quests" kicker="Working on">
              <ul className="space-y-4">
                {bigQuests.map((q) => {
                  const done = q.objectives.filter((o) => o.done).length;
                  return (
                    <li key={q.id}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`skew-box px-2 py-0.5 font-label text-[11px] font-extrabold tracking-widest uppercase ${q.isBoss ? "bg-volt text-ink" : "bg-crimson"}`}>{q.isBoss ? "Boss" : "Main"}</span>
                        <span className="truncate font-display text-xl uppercase">{q.title}</span>
                        <span className="ml-auto font-label text-sm font-extrabold text-muted tabular-nums">
                          {done}/{q.objectives.length}
                        </span>
                      </div>
                      <XpBar progress={done / Math.max(1, q.objectives.length)} label={`${q.title} progress`} size="sm" tone={q.isBoss ? "volt" : "crimson"} />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {show("world") && (
        <section className="mt-12">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="-rotate-1 font-display text-4xl uppercase">The island</h2>
            <Link href={`${basePath}/world`} className="font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">
              Explore →
            </Link>
          </div>
          <WorldMap levels={levels} selected={null} onSelect={() => {}} />
        </section>
      )}

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-2">
        {show("trophies") && (
          <Panel title="Trophies" kicker={`${trophies.length} / ${ACHIEVEMENTS.length}`}>
            {trophies.length === 0 ? (
              <p className="text-sm text-muted">No trophies yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {trophies.slice(0, 6).map((a) => (
                  <li key={a.slug} className="slash-panel bg-crimson p-3">
                    <span className="block font-display text-lg leading-tight uppercase">★ {a.name}</span>
                    <span className="block text-xs opacity-80">{a.description}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`${basePath}/trophies`} className="mt-4 inline-block font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">
              All trophies →
            </Link>
          </Panel>
        )}
        {show("journal") && (
          <Panel title="Lately" kicker="From the journal">
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-ink-3">
                {data.recent.slice(0, 8).map((e) => {
                  const a = activityOf(e.activitySlug, data.activities);
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span className="w-10 font-label text-xs font-extrabold tracking-wider text-muted">{e.source === "skill" ? "SKL" : e.questId || e.source === "quest" ? "QST" : domainGlyph(e.domain)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {a?.name ?? e.note ?? "Reward"}
                        {a && <span className="text-muted"> · {unitLabel(Math.round(e.units), a.unit)}</span>}
                      </span>
                      <span className="font-label font-extrabold text-crimson tabular-nums">+{e.xp}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href={`${basePath}/journal`} className="mt-4 inline-block font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">
              Open the journal →
            </Link>
          </Panel>
        )}
      </div>
    </main>
  );
}
