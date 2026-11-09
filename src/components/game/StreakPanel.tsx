"use client";

import { gameConfig } from "@/lib/game/config";
import { type DayStatus, type Progress, addDays, weekStart } from "@/lib/game/streaks";
import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";

type CellStatus = DayStatus | "future" | "none";

const CELL: Record<CellStatus, { className: string; mark: string; label: string }> = {
  active: { className: "bg-crimson text-paper", mark: "■", label: "active" },
  rest: { className: "border-2 border-paper text-paper", mark: "R", label: "rest day" },
  "planned-rest": { className: "border-2 border-paper/70 text-paper", mark: "R", label: "planned rest day" },
  shielded: { className: "bg-volt text-ink", mark: "◆", label: "missed, saved by a shield" },
  missed: { className: "bg-ink-3 text-muted", mark: "×", label: "missed" },
  pending: { className: "border-2 border-dashed border-crimson text-paper", mark: "?", label: "today, nothing logged yet" },
  future: { className: "bg-ink-3/40 text-muted", mark: "", label: "upcoming" },
  none: { className: "text-muted/40", mark: "", label: "before your first log" },
};

const LEGEND: CellStatus[] = ["active", "rest", "shielded", "missed", "pending"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function fmt(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function StreakPanel({
  progress,
  today,
  restDays,
  ready,
  canEdit,
  isBusy,
  onToggleRest,
}: {
  progress: Progress;
  today: string;
  restDays: string[];
  ready: boolean;
  canEdit: boolean;
  isBusy: (day: string) => boolean;
  onToggleRest: (day: string, isRest: boolean) => void;
}) {
  if (!ready) {
    if (!canEdit) return null;
    return (
      <Panel title="Streak" kicker="Setup needed">
        <p className="text-sm">
          Streaks need a one-time database update. In Supabase, open the <strong>SQL Editor</strong>, run{" "}
          <code className="bg-ink-3 px-1">supabase/migrations/0003_streaks.sql</code>, then refresh this page.
        </p>
      </Panel>
    );
  }

  const { maxShields, planAheadDays } = gameConfig.streak;
  const bonusPct = Math.round((progress.xpMultiplier - 1) * 100);
  const firstDay = addDays(weekStart(today), -14); // two past weeks, this week, next week
  const cells = Array.from({ length: 28 }, (_, i) => addDays(firstDay, i));
  const lastPlannable = addDays(today, planAheadDays);

  const statusOf = (day: string): CellStatus => {
    if (day === today) return progress.todayStatus === "active" ? "active" : progress.todayStatus === "rest" ? "rest" : "pending";
    return progress.statuses[day] ?? (day > today ? "future" : "none");
  };

  const todayLine =
    progress.todayStatus === "active"
      ? "Today counts ✓"
      : progress.todayStatus === "rest"
        ? "Rest day: your streak is safe today."
        : progress.ifMissedToday === "shield"
          ? `Log anything today to reach ${progress.streak + 1}. If you miss today, a shield saves your streak.`
          : progress.ifMissedToday === "break"
            ? `Log anything today to reach ${progress.streak + 1}. If you miss today, your streak resets.`
            : "Log anything today to start a streak.";

  return (
    <Panel title="Streak" kicker="Keep the chain">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-4">
        <div className="text-center">
          <div className="font-display text-7xl leading-none tabular-nums">{progress.streak}</div>
          <div className="font-label text-sm font-extrabold tracking-widest text-crimson uppercase">Day streak</div>
          <div className="text-xs text-muted">Best {progress.bestStreak}</div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 font-label text-sm font-extrabold tracking-widest text-muted uppercase">Shields</div>
            <div className="flex gap-2" role="img" aria-label={`${progress.shields} of ${maxShields} shields`}>
              {Array.from({ length: maxShields }, (_, i) => (
                <span key={i} className={`h-5 w-5 rotate-45 ${i < progress.shields ? "bg-volt" : "border-2 border-ink-3"}`} />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between font-label text-sm font-extrabold tracking-widest uppercase">
              <span className="text-muted">Momentum</span>
              <span className="tabular-nums">{Math.round(progress.momentum)}</span>
            </div>
            <XpBar progress={progress.momentum / 100} label="Momentum" size="sm" />
            <div className="mt-1 text-xs text-muted">
              {bonusPct > 0 ? (
                <>Today&apos;s activities get <span className="font-semibold text-volt">+{bonusPct}% XP</span></>
              ) : (
                "Be active today to build tomorrow's XP bonus."
              )}
            </div>
          </div>
        </div>
      </div>

      <p className={`mt-4 text-sm ${progress.ifMissedToday === "break" ? "text-paper" : "text-muted"}`}>{todayLine}</p>

      <div className="mt-4">
        <div className="mb-1 grid grid-cols-7 gap-1.5 text-center font-label text-xs font-extrabold text-muted">
          {WEEKDAYS.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day) => {
            const status = statusOf(day);
            const style = CELL[status];
            const isRest = restDays.includes(day);
            const plannable = canEdit && day >= today && day <= lastPlannable && (day !== today || progress.todayStatus !== "active");
            const label = `${fmt(day)}: ${style.label}${plannable ? (isRest ? ". Tap to cancel the rest day" : ". Tap to plan a rest day") : ""}`;
            const content = (
              <>
                <span className="text-[11px] leading-none opacity-80">{Number(day.slice(8))}</span>
                <span className="font-display text-sm leading-none">{style.mark}</span>
              </>
            );
            const cellClass = `flex aspect-square flex-col items-center justify-center gap-0.5 ${style.className} ${day === today ? "ring-2 ring-paper ring-offset-2 ring-offset-ink-2" : ""}`;
            return plannable ? (
              <button
                key={day}
                onClick={() => onToggleRest(day, isRest)}
                disabled={isBusy(day)}
                aria-label={label}
                title={label}
                className={`${cellClass} transition-transform hover:scale-105 disabled:opacity-50`}
              >
                {content}
              </button>
            ) : (
              <div key={day} aria-label={label} title={label} role="img" className={cellClass}>
                {content}
              </div>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {LEGEND.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={`grid h-4 w-4 place-items-center text-[10px] ${CELL[s].className}`}>{CELL[s].mark === "■" ? "" : CELL[s].mark}</span>
              {CELL[s].label === "missed, saved by a shield" ? "shield used" : CELL[s].label === "today, nothing logged yet" ? "today" : CELL[s].label}
            </li>
          ))}
        </ul>
        {canEdit && (
          <p className="mt-3 text-xs text-muted">
            Tap today or a future day to plan a rest day · {progress.restLeftThisWeek} left this week (Mon–Sun). Rest days keep your streak
            safe but can&apos;t be added after the fact.
          </p>
        )}
      </div>
    </Panel>
  );
}
