"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { gameConfig } from "@/lib/game/config";
import { domainLabel } from "@/lib/game/format";
import { REGIONS, STAGE_LEVELS, nextStage, stageFor, worldProgress } from "@/lib/game/world";
import { totalXpForLevel } from "@/lib/game/xp";
import { useGame } from "../GameProvider";
import { WorldMap } from "../WorldMap";
import { PageHeader } from "./PageHeader";

export function WorldView() {
  const { summary } = useGame();
  const levels = Object.fromEntries(REGIONS.map((r) => [r.domain, summary.domains[r.domain]?.level ?? 1]));
  const xpOf = (d: string) => summary.domains[d]?.totalXp ?? 0;
  // Start on the region closest to its next upgrade.
  const closest = [...REGIONS].sort((a, b) => (nextStage(a, levels[a.domain], xpOf(a.domain))?.xpToGo ?? Infinity) - (nextStage(b, levels[b.domain], xpOf(b.domain))?.xpToGo ?? Infinity))[0];
  const [selected, setSelected] = useState<string>(closest.domain);
  const region = REGIONS.find((r) => r.domain === selected)!;
  const level = levels[region.domain];
  const stage = stageFor(level);
  const next = nextStage(region, level, xpOf(region.domain));
  const { built, total } = worldProgress(levels);
  const curve = gameConfig.levels.domain;
  const stageStartXp = totalXpForLevel(STAGE_LEVELS[stage], curve);
  const toNext = next ? (xpOf(region.domain) - stageStartXp) / (totalXpForLevel(next.level, curve) - stageStartXp) : 1;

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Your island" title="World">
        <div className="skew-box bg-ink-3 px-5 py-1 font-label text-lg font-extrabold tracking-wider uppercase">
          <span className="text-volt">{built}</span> / {total} upgrades built
        </div>
      </PageHeader>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div>
          <WorldMap levels={levels} selected={selected} onSelect={setSelected} />
          <p className="mt-2 text-xs text-muted">Each region grows as its domain levels up. Tap a region for details.</p>
        </div>
        <div className="space-y-10">
          <Panel title={region.name} kicker={`${domainLabel(region.domain)} · Lv ${level}`}>
            <p className="text-sm text-muted italic">{region.tagline}</p>
            <p className="mt-3 font-label text-xs font-extrabold tracking-widest text-muted uppercase">
              Stage {stage + 1} of {STAGE_LEVELS.length}
            </p>
            <h2 className="font-display text-3xl leading-tight uppercase">{region.stages[stage]}</h2>
            {next ? (
              <div className="mt-3">
                <XpBar progress={toNext} label={`Progress to ${next.name}`} size="sm" />
                <p className="mt-1 text-sm">
                  Next: <strong>{next.name}</strong> at {domainLabel(region.domain)} Lv {next.level} ·{" "}
                  <span className="text-volt">{next.xpToGo.toLocaleString()} XP to go</span>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-volt">Fully built. Legendary.</p>
            )}
            <ol className="mt-5 space-y-1.5">
              {region.stages.map((name, i) => (
                <li key={name} className={`flex items-center gap-3 text-sm ${i <= stage ? "" : "text-muted"}`}>
                  <span className={`h-3 w-3 shrink-0 rotate-45 ${i < stage ? "bg-crimson" : i === stage ? "bg-volt" : "border border-muted"}`} />
                  <span className="flex-1">{name}</span>
                  <span className="font-label text-xs font-extrabold tracking-widest uppercase">Lv {STAGE_LEVELS[i]}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Regions">
            <ul className="space-y-1">
              {REGIONS.map((r) => (
                <li key={r.domain}>
                  <button
                    onClick={() => setSelected(r.domain)}
                    aria-pressed={selected === r.domain}
                    className={`flex w-full items-center gap-3 px-2 py-1.5 text-left text-sm ${selected === r.domain ? "bg-ink-3" : "hover:bg-ink-3/60"}`}
                  >
                    <span className="flex-1 font-label font-extrabold tracking-wider uppercase">{r.name}</span>
                    <span className="text-muted">{r.stages[stageFor(levels[r.domain])]}</span>
                    <span className="w-10 text-right font-display">{levels[r.domain]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </main>
  );
}
