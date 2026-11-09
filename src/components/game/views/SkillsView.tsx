"use client";

import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import { gameConfig } from "@/lib/game/config";
import { THEMES } from "@/lib/game/themes";
import { useGame } from "../GameProvider";
import { SkillTrees } from "../SkillTrees";
import { StatRadar } from "../StatRadar";
import { PageHeader } from "./PageHeader";

function Stats() {
  const { summary } = useGame();
  return (
    <Panel title="Stats" kicker="Domain levels">
      <StatRadar
        stats={gameConfig.domains.map((d) => ({ id: d.id, label: d.label, level: summary.domains[d.id].level, totalXp: summary.domains[d.id].totalXp }))}
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
  );
}

function Unlocks() {
  const { summary, mode } = useGame();
  const level = summary.overall.level;
  return (
    <Panel title="Unlocks" kicker="Earned by leveling up">
      <ol className="space-y-3">
        {THEMES.map((t) => {
          const unlocked = level >= t.level;
          return (
            <li key={t.id} className="flex items-center gap-3">
              <span
                className={`skew-box w-14 shrink-0 py-0.5 text-center font-label text-sm font-extrabold ${unlocked ? "bg-paper text-ink" : "bg-ink-3 text-muted"}`}
              >
                Lv {t.level}
              </span>
              <span aria-hidden className="h-6 w-6 shrink-0 rotate-45" style={{ background: unlocked ? t.accent : "var(--ink-3)" }} />
              <span className={`flex-1 ${unlocked ? "" : "text-muted"}`}>
                <span className="font-label font-extrabold tracking-wider uppercase">{t.name}</span> color theme
              </span>
              <span className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">{unlocked ? "Unlocked" : "Locked"}</span>
            </li>
          );
        })}
      </ol>
      {mode === "owner" && <p className="mt-4 text-xs text-muted">Pick your theme in Settings.</p>}
    </Panel>
  );
}

export function SkillsView() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Character" title="Skills" />
      <div className="space-y-10">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-2">
          <Stats />
          <Unlocks />
        </div>
        <SkillTrees />
      </div>
    </main>
  );
}
