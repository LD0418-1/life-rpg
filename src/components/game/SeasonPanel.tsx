"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { XpBar } from "@/components/ui/XpBar";
import { type Season, currentSeason, daysBetween, seasonState, seasonStats, suggestSeason } from "@/lib/game/seasons";
import { addDays } from "@/lib/game/streaks";
import { useGame } from "./GameProvider";
import { ShareButton } from "./ShareButton";

/** "Share recap" for a season (owner and preview only). */
function SeasonShare({ season, stats }: { season: Season; stats: ReturnType<typeof seasonStats> }) {
  const { mode, cardHref } = useGame();
  if (mode === "visitor") return null;
  const href = cardHref({
    type: "season",
    seasonId: season.id,
    name: season.name,
    rank: stats.rank,
    xp: stats.xp,
    activeDays: stats.activeDays,
    days: stats.state === "past" ? stats.totalDays : stats.elapsedDays,
    goals: `${stats.goalsDone}/${stats.goalsTotal}`,
    levels: stats.levelNow > stats.levelAtStart ? `${stats.levelAtStart} → ${stats.levelNow}` : String(stats.levelNow),
  });
  return <ShareButton href={href} filename="season-recap.png" title={`Season recap: ${season.name}`} label="Share recap" className="!text-sm" />;
}

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson [color-scheme:dark]";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

/** Goals of a season: active quests pinned to it, plus finished/abandoned ones. */
function useGoals(season: Season) {
  const { data } = useGame();
  return [
    ...data.quests.filter((q) => q.seasonId === season.id).map((q) => ({ id: q.id, title: q.title, done: Boolean(q.completed), dropped: false, active: !q.completed })),
    ...data.closedSeasonGoals
      .filter((g) => g.seasonId === season.id)
      .map((g) => ({ id: g.id, title: g.title, done: g.status === "completed", dropped: g.status === "abandoned", active: false })),
  ];
}

function useStats(season: Season) {
  const { data } = useGame();
  const goals = useGoals(season);
  return { goals, stats: seasonStats(season, data.days, data.today, data.completedOn, goals) };
}

function RankBadge({ rank, size = "lg" }: { rank: string; size?: "lg" | "sm" }) {
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={`skew-box inline-grid place-items-center font-display ${rank === "S" ? "bg-volt text-ink" : rank === "A" ? "bg-crimson text-paper" : "bg-ink-3 text-paper"} ${
        size === "lg" ? "h-16 w-16 text-5xl" : "h-10 w-10 text-2xl"
      }`}
    >
      {rank}
    </span>
  );
}

function NewSeasonForm({ startsOn, onDone }: { startsOn: string; onDone: () => void }) {
  const { data, createSeason } = useGame();
  const suggestion = suggestSeason(startsOn);
  const [name, setName] = useState("");
  const [start, setStart] = useState(startsOn);
  const [end, setEnd] = useState(suggestion.endsOn);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const candidates = data.quests.filter((q) => !q.completed && !q.seasonId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await createSeason({ name: name || suggestion.name, startsOn: start, endsOn: end, notes, questIds: picked });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="season-name" className={labelClass}>Season name</label>
        <input id="season-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${suggestion.name}, or something like "Winter arc"`} className={fieldClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="season-start" className={labelClass}>Starts</label>
          <input id="season-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="season-end" className={labelClass}>Ends</label>
          <input id="season-end" type="date" required value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">{daysBetween(start, end) + 1} days. About a quarter (90 days) works well.</p>
      <div>
        <label htmlFor="season-notes" className={labelClass}>What this chapter is about · optional</label>
        <textarea id="season-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Get strong, ship the side project, call family more." className={fieldClass} />
      </div>
      {candidates.length > 0 && (
        <fieldset>
          <legend className={labelClass}>Goals · pin quests to this season</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {candidates.map((q) => (
              <label key={q.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(q.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, q.id] : p.filter((x) => x !== q.id)))}
                  className="h-4 w-4 accent-[var(--crimson)]"
                />
                <span className="truncate">{q.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex gap-3">
        <SlashButton type="submit" disabled={saving}>{saving ? "Saving…" : "Begin season"}</SlashButton>
        <SlashButton type="button" variant="ghost" onClick={onDone}>Cancel</SlashButton>
      </div>
    </form>
  );
}

function EditSeasonForm({ season, onDone }: { season: Season; onDone: () => void }) {
  const { data, updateSeason } = useGame();
  const [name, setName] = useState(season.name);
  const [notes, setNotes] = useState(season.notes ?? "");
  const [end, setEnd] = useState(season.endsOn);
  const [saving, setSaving] = useState(false);
  const past = seasonState(season, data.today) === "past";

  const save = async (endsOn: string) => {
    setSaving(true);
    const ok = await updateSeason(season, { name, notes, endsOn });
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(end);
      }}
      className="space-y-4 border-l-2 border-crimson pl-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <div>
          <label htmlFor={`season-name-${season.id}`} className={labelClass}>Name</label>
          <input id={`season-name-${season.id}`} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </div>
        {!past && (
          <div>
            <label htmlFor={`season-end-${season.id}`} className={labelClass}>Ends</label>
            <input id={`season-end-${season.id}`} type="date" required value={end} min={data.today} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
          </div>
        )}
      </div>
      <div>
        <label htmlFor={`season-notes-${season.id}`} className={labelClass}>Notes</label>
        <textarea id={`season-notes-${season.id}`} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
      </div>
      <div className="flex flex-wrap gap-3">
        <SlashButton type="submit" disabled={saving}>Save</SlashButton>
        {!past && seasonState(season, data.today) === "current" && (
          <SlashButton
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => window.confirm(`End "${season.name}" today? It becomes a recap in your history.`) && void save(data.today)}
          >
            End season today
          </SlashButton>
        )}
        <SlashButton type="button" variant="ghost" onClick={onDone}>Cancel</SlashButton>
      </div>
    </form>
  );
}

function CurrentSeason({ season }: { season: Season }) {
  const { canEdit, data } = useGame();
  const { goals, stats } = useStats(season);
  const [editing, setEditing] = useState(false);
  const left = stats.totalDays - stats.dayNumber;

  return (
    <Panel title="Season" kicker={`${season.startsOn} → ${season.endsOn}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-4xl leading-tight break-words uppercase">{season.name}</h2>
          {season.notes && <p className="mt-1 text-sm text-muted">{season.notes}</p>}
        </div>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} aria-label={`Edit ${season.name}`} className="px-2 text-muted hover:text-paper">
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-4">
          <EditSeasonForm season={season} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <XpBar progress={stats.dayNumber / stats.totalDays} label="Season progress" size="sm" />
            <p className="mt-1 font-label text-sm font-extrabold tracking-wider text-muted uppercase">
              Day {stats.dayNumber} of {stats.totalDays} · {left === 0 ? "last day!" : `${left} days left`}
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-[auto_repeat(4,minmax(0,1fr))] sm:items-center">
            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
              <RankBadge rank={stats.rank} />
              <span className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">
                Rank
                <br />
                so far
              </span>
            </div>
            {[
              ["XP earned", stats.xp.toLocaleString()],
              ["Active days", `${stats.activeDays} / ${stats.elapsedDays}`],
              ["Goals", `${stats.goalsDone} / ${stats.goalsTotal}`],
              ["Level", stats.levelNow > stats.levelAtStart ? `${stats.levelAtStart} → ${stats.levelNow}` : String(stats.levelNow)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="font-display text-2xl tabular-nums">{v}</div>
                <div className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <p className="mb-2 font-label text-sm font-extrabold tracking-widest text-muted uppercase">Season goals</p>
            {goals.length === 0 ? (
              <p className="text-sm text-muted">{canEdit ? "No goals yet. Tap ★ on a quest below to pin it to this season." : "No goals pinned."}</p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {goals.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-3 w-3 shrink-0 rotate-45 ${g.done ? "bg-volt" : g.dropped ? "bg-ink-3" : "border border-muted"}`} />
                    <span className={g.done || g.dropped ? "text-muted line-through" : ""}>{g.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5">
            <SeasonShare season={season} stats={stats} />
          </div>
          {data.seasons.some((s) => seasonState(s, data.today) === "upcoming") || !canEdit ? null : (
            <PlanNext after={season.endsOn} />
          )}
        </>
      )}
    </Panel>
  );
}

function PlanNext({ after }: { after: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-6 border-t border-ink-3 pt-5">
      <NewSeasonForm startsOn={addDays(after, 1)} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <button onClick={() => setOpen(true)} className="mt-5 font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">
      + Plan the next season
    </button>
  );
}

function PastSeasonCard({ season }: { season: Season }) {
  const { canEdit } = useGame();
  const { stats } = useStats(season);
  const [editing, setEditing] = useState(false);
  return (
    <li className="slash-panel bg-ink-2 p-4">
      <div className="flex items-start gap-4">
        <RankBadge rank={stats.rank} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight break-words uppercase">{season.name}</h3>
          <p className="text-xs text-muted">
            {season.startsOn} → {season.endsOn}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setEditing(!editing)} aria-label={`Edit ${season.name}`} className="px-1 text-muted hover:text-paper">
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3">
          <EditSeasonForm season={season} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          {season.notes && <p className="mt-2 text-sm text-muted">{season.notes}</p>}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">XP earned</dt>
            <dd className="text-right tabular-nums">{stats.xp.toLocaleString()}</dd>
            <dt className="text-muted">Active days</dt>
            <dd className="text-right tabular-nums">
              {stats.activeDays} / {stats.totalDays}
            </dd>
            <dt className="text-muted">Best streak</dt>
            <dd className="text-right tabular-nums">{stats.bestStreak}</dd>
            <dt className="text-muted">Goals</dt>
            <dd className="text-right tabular-nums">
              {stats.goalsDone} / {stats.goalsTotal}
            </dd>
            <dt className="text-muted">Level</dt>
            <dd className="text-right tabular-nums">
              {stats.levelAtStart} → {stats.levelNow}
            </dd>
          </dl>
          <div className="mt-3">
            <SeasonShare season={season} stats={stats} />
          </div>
        </>
      )}
    </li>
  );
}

export function SeasonPanel() {
  const { data, canEdit } = useGame();
  const [starting, setStarting] = useState(false);
  const current = currentSeason(data.seasons, data.today);
  const upcoming = data.seasons.filter((s) => seasonState(s, data.today) === "upcoming");
  const past = data.seasons.filter((s) => seasonState(s, data.today) === "past").reverse();

  return (
    <div className="space-y-6">
      {current ? (
        <CurrentSeason season={current} />
      ) : (
        <Panel title="Season" kicker="Chapters of your life">
          {starting ? (
            <NewSeasonForm startsOn={data.today} onDone={() => setStarting(false)} />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <p className="flex-1 text-sm text-muted">
                {canEdit
                  ? "Seasons are chapters, usually about 90 days, with a name and a few goals. When one ends, you get a recap with a rank from S to D."
                  : "No season running right now."}
              </p>
              {canEdit && upcoming.length === 0 && <SlashButton onClick={() => setStarting(true)}>Start a season</SlashButton>}
            </div>
          )}
        </Panel>
      )}
      {upcoming.map((s) => (
        <p key={s.id} className="skew-box bg-ink-3 px-6 py-2 text-sm">
          <span className="font-label font-extrabold tracking-wider uppercase">Up next:</span> {s.name} starts {s.startsOn} (
          {daysBetween(data.today, s.startsOn) === 1 ? "tomorrow" : `in ${daysBetween(data.today, s.startsOn)} days`})
        </p>
      ))}
      {past.length > 0 && (
        <div>
          <p className="mb-3 font-label text-sm font-extrabold tracking-[0.3em] text-crimson-text uppercase">Past seasons</p>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {past.map((s) => (
              <PastSeasonCard key={s.id} season={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
