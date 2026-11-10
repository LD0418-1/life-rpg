"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import type { CalEvent } from "@/lib/calendar/ics";
import { FEED_COLORS, feedColor } from "@/lib/calendar/colors";
import { monthLabel, monthOf, monthRange, shiftMonth } from "@/lib/game/finance";
import { addDays, weekStart } from "@/lib/game/streaks";
import type { CalendarData } from "@/lib/game/types";
import { dayInTimeZone } from "@/lib/game/xp";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

interface DayItem {
  event: CalEvent;
  time: string | null;
}

/** Puts each event on the local day(s) it happens. All-day events span their days; timed ones sit on their start day. */
function useEventsByDay(events: CalEvent[], timeZone: string) {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone });
    const map = new Map<string, DayItem[]>();
    const add = (day: string, item: DayItem) => map.set(day, [...(map.get(day) ?? []), item]);
    for (const e of events) {
      if (e.allDay) {
        for (let d = e.start; d < e.end; d = addDays(d, 1)) add(d, { event: e, time: null });
      } else {
        const start = new Date(e.start);
        add(dayInTimeZone(start, timeZone), { event: e, time: `${fmt.format(start)}–${fmt.format(new Date(e.end))}` });
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.time === null ? -1 : b.time === null ? 1 : a.event.start.localeCompare(b.event.start)));
    return map;
  }, [events, timeZone]);
}

/** Life RPG things that happened (or are planned) on a day. */
function useGameMarks() {
  const { data } = useGame();
  return useMemo(() => {
    const xp = new Map(data.days.map((d) => [d.day, d.xp]));
    const rest = new Set(data.restDays);
    const quests = new Map<string, number>();
    for (const d of data.completedOn) quests.set(d, (quests.get(d) ?? 0) + 1);
    const seasonMarks = new Map<string, string[]>();
    for (const s of data.seasons) {
      seasonMarks.set(s.startsOn, [...(seasonMarks.get(s.startsOn) ?? []), `★ ${s.name} begins`]);
      seasonMarks.set(s.endsOn, [...(seasonMarks.get(s.endsOn) ?? []), `★ ${s.name} ends`]);
    }
    return (day: string) => ({ xp: xp.get(day) ?? 0, rest: rest.has(day), quests: quests.get(day) ?? 0, seasons: seasonMarks.get(day) ?? [] });
  }, [data.days, data.restDays, data.completedOn, data.seasons]);
}

function FeedsPanel({ cal, onChange }: { cal: CalendarData; onChange: () => void }) {
  const { backend } = useGame();
  const [open, setOpen] = useState(cal.feeds.length === 0);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<string>(FEED_COLORS[cal.feeds.length % FEED_COLORS.length]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await backend.addFeed({ name, url, color });
      setName("");
      setUrl("");
      setOpen(false);
      onChange();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't add that calendar.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string, feedName: string) => {
    if (!window.confirm(`Unlink "${feedName}"? Your actual calendar isn't touched.`)) return;
    await backend.deleteFeed(id).then(onChange, (err) => setMsg(err instanceof Error ? err.message : "Couldn't unlink it."));
  };

  return (
    <Panel title="Calendars" kicker="Linked">
      {cal.feeds.length > 0 && (
        <ul className="mb-4 space-y-2">
          {cal.feeds.map((f) => {
            const err = cal.errors.find((x) => x.feedId === f.id);
            return (
              <li key={f.id} className="flex items-start gap-3">
                <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rotate-45" style={{ background: feedColor(f.color) }} />
                <span className="min-w-0 flex-1">
                  <span className="font-label font-extrabold tracking-wider uppercase">{f.name}</span>
                  <span className="block text-xs text-muted">{f.host}</span>
                  {err && <span className="block text-xs text-volt">⚠ {err.message}</span>}
                </span>
                <button onClick={() => void remove(f.id, f.name)} aria-label={`Unlink ${f.name}`} className="px-1 text-muted hover:text-crimson-text">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open ? (
        <form onSubmit={add} className="space-y-4">
          <div>
            <label htmlFor="feed-name" className={labelClass}>Name</label>
            <input id="feed-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Classes" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="feed-url" className={labelClass}>Calendar link</label>
            <input id="feed-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/… or webcal://…" className={fieldClass} />
          </div>
          <fieldset>
            <legend className={labelClass}>Color</legend>
            <div className="flex gap-2">
              {FEED_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  aria-label={c}
                  className={`h-7 w-7 rotate-45 ${color === c ? "ring-2 ring-paper ring-offset-2 ring-offset-ink-2" : ""}`}
                  style={{ background: feedColor(c) }}
                />
              ))}
            </div>
          </fieldset>
          {msg && <p role="alert" className="bg-paper px-3 py-2 text-sm text-ink">{msg}</p>}
          <div className="flex gap-3">
            <SlashButton type="submit" disabled={busy}>{busy ? "Checking…" : "Link calendar"}</SlashButton>
            {cal.feeds.length > 0 && <SlashButton type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</SlashButton>}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-label font-extrabold tracking-wider text-muted uppercase hover:text-paper">Where do I find my link?</summary>
            <div className="mt-2 space-y-3 text-muted">
              <div>
                <p className="font-semibold text-paper">Google Calendar</p>
                <ol className="ml-5 list-decimal">
                  <li>Open Google Calendar on a computer → ⚙ Settings.</li>
                  <li>On the left, under &ldquo;Settings for my calendars&rdquo;, pick the calendar.</li>
                  <li>Scroll to &ldquo;Integrate calendar&rdquo; and copy <strong>Secret address in iCal format</strong>.</li>
                </ol>
              </div>
              <div>
                <p className="font-semibold text-paper">Apple Calendar (iCloud)</p>
                <ol className="ml-5 list-decimal">
                  <li>In the Calendar app (iPhone: Calendars → ⓘ next to a calendar; Mac: right-click → Share Calendar).</li>
                  <li>Turn on <strong>Public Calendar</strong> and copy the link (starts with webcal://).</li>
                </ol>
              </div>
              <p>
                The link is stored privately and only your server reads it; it&apos;s never shown to visitors. Anyone who has the link can read
                that calendar, so keep it to yourself. In Google you can reset it anytime.
              </p>
            </div>
          </details>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper">
          + Link a calendar
        </button>
      )}
    </Panel>
  );
}

function EventChip({ item, compact }: { item: DayItem; compact?: boolean }) {
  const color = feedColor(item.event.feedId ? colorFor.get(item.event.feedId) ?? "crimson" : "crimson");
  return (
    <span className={`flex min-w-0 items-center gap-1 ${compact ? "text-[11px] leading-tight" : "text-sm"}`} title={`${item.time ?? "All day"} · ${item.event.title}`}>
      <span aria-hidden className="h-full min-h-3 w-1 shrink-0 self-stretch" style={{ background: color }} />
      <span className="truncate">
        {item.time && !compact && <span className="text-muted">{item.time} </span>}
        {item.event.title}
      </span>
    </span>
  );
}

// Feed colors by id, filled in when calendar data loads (keeps chips simple).
const colorFor = new Map<string, string>();

function DayDetail({ day, items, onClose }: { day: string; items: DayItem[]; onClose?: () => void }) {
  const { data } = useGame();
  const marks = useGameMarks()(day);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl uppercase">{day === data.today ? "Today" : longDay(day)}</h3>
        {onClose && (
          <button onClick={onClose} aria-label="Close day" className="px-2 text-muted hover:text-paper">
            ×
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.event.id} className="flex gap-3">
            <span aria-hidden className="w-1 shrink-0" style={{ background: feedColor(colorFor.get(it.event.feedId) ?? "crimson") }} />
            <span className="min-w-0">
              <span className="block font-semibold">{it.event.title}</span>
              <span className="block text-xs text-muted">
                {it.time ?? "All day"}
                {it.event.location ? ` · ${it.event.location}` : ""}
              </span>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted">No events.</li>}
      </ul>
      {(marks.xp > 0 || marks.rest || marks.quests > 0 || marks.seasons.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-3 pt-3 font-label text-xs font-extrabold tracking-wider uppercase">
          {marks.xp > 0 && <span className="skew-box bg-crimson px-3 py-0.5">+{marks.xp} XP</span>}
          {marks.rest && <span className="skew-box border-2 border-paper px-3 py-0.5">Rest day</span>}
          {marks.quests > 0 && <span className="skew-box bg-volt px-3 py-0.5 text-ink">{marks.quests} quest{marks.quests > 1 ? "s" : ""} cleared</span>}
          {marks.seasons.map((s) => (
            <span key={s} className="skew-box bg-paper px-3 py-0.5 text-ink">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarView() {
  const { data, backend, canEdit } = useGame();
  const [month, setMonth] = useState(monthOf(data.today));
  const [view, setView] = useState<"month" | "agenda">("month");
  const [cal, setCal] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(data.today);
  const [reload, setReload] = useState(0);
  const marksFor = useGameMarks();

  // Phones start on the agenda: a month grid is cramped at that width.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("agenda");
  }, []);

  const { from: monthStart, to: monthEnd } = monthRange(month);
  const gridStart = weekStart(monthStart);
  const gridEnd = addDays(weekStart(monthEnd), 6);

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    setError(null);
    backend
      .loadCalendar(gridStart, gridEnd)
      .then((r) => {
        if (!live) return;
        for (const f of r.feeds) colorFor.set(f.id, f.color);
        setCal(r);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your calendar."));
    return () => {
      live = false;
    };
  }, [backend, canEdit, gridStart, gridEnd, reload]);

  const byDay = useEventsByDay(cal?.events ?? [], data.timezone);

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-8">
        <PageHeader kicker="Schedule" title="Calendar" />
        <p className="text-muted">The calendar is private.</p>
      </main>
    );
  }

  const cells: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
  const agendaStart = month === monthOf(data.today) ? data.today : monthStart;
  const agendaDays: string[] = [];
  for (let d = agendaStart; d <= monthEnd; d = addDays(d, 1)) agendaDays.push(d);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Schedule" title="Calendar">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson">‹</button>
            <button onClick={() => { setMonth(monthOf(data.today)); setSelected(data.today); }} className="min-w-[10.5rem] text-center font-label text-lg font-extrabold tracking-wider uppercase hover:text-volt" title="Back to today">
              {monthLabel(month)}
            </button>
            <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson">›</button>
          </div>
          <div className="flex gap-1">
            {(["month", "agenda"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`skew-box px-3 py-0.5 font-label text-sm font-extrabold tracking-wider uppercase ${view === v ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {!data.extrasReady && (
        <p className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">
          The calendar needs a one-time database update: run <code>supabase/migrations/0005_rewards_wallet_calendar.sql</code> in the Supabase SQL Editor.
        </p>
      )}
      {error && data.extrasReady && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div>
          {view === "month" ? (
            <div>
              <div className="grid grid-cols-7 gap-1 pb-1 text-center font-label text-xs font-extrabold tracking-widest text-muted uppercase">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day) => {
                  const items = byDay.get(day) ?? [];
                  const m = marksFor(day);
                  const inMonth = day >= monthStart && day <= monthEnd;
                  const isToday = day === data.today;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelected(day)}
                      aria-pressed={selected === day}
                      aria-label={`${longDay(day)}: ${items.length} event${items.length === 1 ? "" : "s"}${m.xp ? `, ${m.xp} XP` : ""}`}
                      className={`flex min-h-24 min-w-0 flex-col gap-0.5 p-1.5 text-left transition-colors ${inMonth ? "bg-ink-2" : "bg-ink-2/40 text-muted"} ${
                        selected === day ? "outline-2 outline-offset-[-2px] outline-volt" : "hover:bg-ink-3"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <span className={`grid h-6 min-w-6 place-items-center px-1 font-display text-sm ${isToday ? "skew-box bg-crimson text-paper" : ""}`}>{Number(day.slice(8))}</span>
                        {m.xp > 0 && <span aria-hidden className="h-2 w-2 bg-crimson" title={`+${m.xp} XP`} />}
                        {m.rest && <span aria-hidden className="font-display text-[10px] leading-none">R</span>}
                        {m.quests > 0 && <span aria-hidden className="h-2 w-2 rotate-45 bg-volt" />}
                        {m.seasons.length > 0 && <span aria-hidden className="text-[10px] leading-none text-volt">★</span>}
                      </span>
                      {items.slice(0, 3).map((it) => (
                        <EventChip key={it.event.id} item={it} compact />
                      ))}
                      {items.length > 3 && <span className="text-[11px] text-muted">+{items.length - 3} more</span>}
                    </button>
                  );
                })}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <li className="flex items-center gap-1.5"><span className="h-2 w-2 bg-crimson" /> active day</li>
                <li className="flex items-center gap-1.5"><span className="font-display text-[10px]">R</span> rest day</li>
                <li className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-volt" /> quest cleared</li>
                <li className="flex items-center gap-1.5"><span className="text-volt">★</span> season starts / ends</li>
              </ul>
            </div>
          ) : (
            <Panel title="Agenda" kicker={monthLabel(month)}>
              <div className="space-y-5">
                {agendaDays.map((day) => {
                  const items = byDay.get(day) ?? [];
                  const m = marksFor(day);
                  if (!items.length && !m.xp && !m.rest && !m.quests && !m.seasons.length && day !== data.today) return null;
                  return (
                    <section key={day}>
                      <DayDetail day={day} items={items} />
                    </section>
                  );
                })}
                {!cal && <p className="text-sm text-muted">Loading…</p>}
              </div>
            </Panel>
          )}
        </div>
        <div className="space-y-10">
          {view === "month" && selected && (
            <Panel title="Day" kicker={selected === data.today ? "Today" : selected}>
              <DayDetail day={selected} items={byDay.get(selected) ?? []} />
            </Panel>
          )}
          {cal && <FeedsPanel cal={cal} onChange={() => setReload((n) => n + 1)} />}
        </div>
      </div>
    </main>
  );
}
