"use client";

import { XpBar } from "@/components/ui/XpBar";
import { ACHIEVEMENTS, achievementProgress } from "@/lib/game/achievements";
import { shortDate } from "@/lib/game/format";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

export function TrophiesView() {
  const { data } = useGame();
  const { stats, unlocked } = data.achievements;
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.slug]).length;
  // Unlocked first (newest first), then visible locked ones by progress, hidden last.
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const ua = unlocked[a.slug];
    const ub = unlocked[b.slug];
    if (ua && ub) return ub.localeCompare(ua);
    if (ua || ub) return ua ? -1 : 1;
    if (Boolean(a.hidden) !== Boolean(b.hidden)) return a.hidden ? 1 : -1;
    const pa = achievementProgress(a, stats);
    const pb = achievementProgress(b, stats);
    return pb.current / pb.target - pa.current / pa.target;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Achievements" title="Trophies">
        <div className="skew-box bg-ink-3 px-5 py-1 font-label text-lg font-extrabold tracking-wider uppercase">
          <span className="text-volt">{count}</span> / {ACHIEVEMENTS.length} unlocked
        </div>
      </PageHeader>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => {
          const at = unlocked[a.slug];
          const secret = a.hidden && !at;
          const p = achievementProgress(a, stats);
          return (
            <li
              key={a.slug}
              className={`slash-panel relative flex gap-4 p-4 ${at ? "bg-crimson text-paper" : "bg-ink-2 text-paper"} ${secret ? "opacity-70" : ""}`}
            >
              <span
                aria-hidden
                className={`grid h-12 w-12 shrink-0 rotate-45 place-items-center ${at ? "bg-volt text-ink" : "border-2 border-ink-3 text-muted"}`}
              >
                <span className="-rotate-45 font-display text-xl">{at ? "★" : secret ? "?" : "☆"}</span>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl leading-tight uppercase">{secret ? "???" : a.name}</h2>
                <p className={`text-sm ${at ? "" : "text-muted"}`}>{secret ? "Hidden achievement. Keep playing to find it." : a.description}</p>
                {at ? (
                  <p className="mt-1 font-label text-xs font-extrabold tracking-widest uppercase opacity-80">Unlocked {shortDate(at)}</p>
                ) : (
                  !secret && (
                    <div className="mt-2 flex items-center gap-2">
                      <XpBar progress={p.current / p.target} label={`${a.name} progress`} size="sm" />
                      <span className="font-label text-xs font-extrabold whitespace-nowrap text-muted tabular-nums">
                        {p.current.toLocaleString()} / {p.target.toLocaleString()}
                      </span>
                    </div>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
