"use client";

// Diary: jot down notes, one or more per day. Private unless you unlock one.
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { DIARY_LIMITS, type DiaryEntry, MOODS, moodOf } from "@/lib/game/diary";
import { monthLabel, monthOf, shiftMonth } from "@/lib/game/finance";
import { addDays } from "@/lib/game/streaks";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson [color-scheme:dark]";
const labelClass = "mb-1 block font-label text-xs font-extrabold tracking-widest text-muted uppercase";
const longDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const DRAFT_KEY = "life-rpg:diary-draft";

interface Draft {
  day: string;
  title: string;
  body: string;
  mood: number | null;
  isPublic: boolean;
}

const emptyDraft = (today: string): Draft => ({ day: today, title: "", body: "", mood: null, isPublic: false });

// The unsaved new entry survives a reload (only in this browser).
function readDraft(today: string): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (saved && typeof saved.body === "string") return { ...emptyDraft(today), ...saved };
  } catch {
    // no storage: start empty
  }
  return emptyDraft(today);
}
function writeDraft(draft: Draft | null) {
  try {
    if (draft && (draft.body.trim() || draft.title.trim())) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // no storage: the draft just isn't kept
  }
}

function Editor({ editingId, initial, onSaved, onCancel }: { editingId: string | null; initial: Draft; onSaved: (e: DiaryEntry) => void; onCancel?: () => void }) {
  const { data, backend, perform, isBusy, logActivity } = useGame();
  const [draft, setDraft] = useState(initial);
  const journal = data.activities.find((a) => a.slug === "journal");
  const canLogJournal = !editingId && Boolean(journal) && draft.day === data.today && (data.todayCounts.journal ?? 0) === 0;
  const [logJournal, setLogJournal] = useState(true);
  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (!editingId) writeDraft(next);
      return next;
    });

  const save = async () => {
    const saved = await perform(`diary:${editingId ?? "new"}`, () => backend.saveDiary({ ...draft, title: draft.title || null }, editingId ?? undefined));
    if (!saved) return;
    if (!editingId) {
      writeDraft(null);
      setDraft(emptyDraft(data.today));
      if (canLogJournal && logJournal && journal) void logActivity(journal);
    }
    onSaved(saved);
  };
  const busy = isBusy(`diary:${editingId ?? "new"}`);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`diary-day-${editingId ?? "new"}`} className={labelClass}>Date</label>
          <input id={`diary-day-${editingId ?? "new"}`} type="date" max={data.today} value={draft.day} onChange={(e) => set({ day: e.target.value })} className={`${fieldClass} w-auto`} />
        </div>
        <fieldset>
          <legend className={labelClass}>Mood · optional</legend>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                type="button"
                key={m.value}
                onClick={() => set({ mood: draft.mood === m.value ? null : m.value })}
                aria-pressed={draft.mood === m.value}
                title={m.label}
                className={`skew-box px-2.5 py-1 font-label text-xs font-extrabold tracking-wider uppercase ${draft.mood === m.value ? "bg-volt text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
              >
                {m.glyph} <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div>
        <label htmlFor={`diary-title-${editingId ?? "new"}`} className={labelClass}>Title · optional</label>
        <input id={`diary-title-${editingId ?? "new"}`} maxLength={DIARY_LIMITS.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="What today was about" className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`diary-body-${editingId ?? "new"}`} className={labelClass}>Entry</label>
        <textarea
          id={`diary-body-${editingId ?? "new"}`}
          rows={editingId ? 6 : 7}
          maxLength={DIARY_LIMITS.body}
          value={draft.body}
          onChange={(e) => set({ body: e.target.value })}
          placeholder="What happened, what you learned, how you feel…"
          className={`${fieldClass} leading-relaxed`}
        />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={draft.isPublic} onChange={(e) => set({ isPublic: e.target.checked })} className="h-4 w-4 accent-[var(--crimson)]" />
          Visitors can read this entry (in your Journal)
        </label>
        {canLogJournal && journal && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={logJournal} onChange={(e) => setLogJournal(e.target.checked)} className="h-4 w-4 accent-[var(--crimson)]" />
            Also log &ldquo;{journal.name}&rdquo; for today&apos;s XP
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SlashButton type="submit" disabled={busy || !draft.body.trim()}>{busy ? "Saving…" : editingId ? "Save changes" : "Save entry"}</SlashButton>
        {onCancel && <SlashButton type="button" variant="ghost" onClick={onCancel}>Cancel</SlashButton>}
        <span className="hidden text-xs text-muted sm:inline">Ctrl / ⌘ + Enter saves</span>
      </div>
    </form>
  );
}

function EntryCard({ entry, onEdit, onChange, onDelete }: { entry: DiaryEntry; onEdit: () => void; onChange: (e: DiaryEntry) => void; onDelete: () => void }) {
  const { backend, perform, isBusy } = useGame();
  const mood = moodOf(entry.mood);
  return (
    <article className="slash-panel bg-paper px-5 pt-4 pb-5 text-ink shadow-[5px_5px_0_var(--crimson)]">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        {mood && <span className="skew-box bg-ink px-2 py-0.5 font-label text-xs font-extrabold tracking-wider text-paper uppercase">{mood.glyph} {mood.label}</span>}
        {entry.title && <h3 className="min-w-0 flex-1 font-display text-2xl leading-tight break-words uppercase">{entry.title}</h3>}
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={() =>
              void perform(`diary-vis:${entry.id}`, async () => {
                await backend.setDiaryPublic(entry.id, !entry.isPublic);
                return true;
              }).then((ok) => ok && onChange({ ...entry, isPublic: !entry.isPublic }))
            }
            disabled={isBusy(`diary-vis:${entry.id}`)}
            title={entry.isPublic ? "Public: visitors can read it. Tap to make it private." : "Private: only you. Tap to make it public."}
            className={`px-2 font-label text-xs font-extrabold tracking-widest uppercase ${entry.isPublic ? "text-crimson" : "text-ink/50 hover:text-ink"}`}
          >
            {entry.isPublic ? "Public" : "🔒 Private"}
          </button>
          <button onClick={onEdit} aria-label="Edit entry" className="px-1.5 text-ink/60 hover:text-ink">✎</button>
          <button onClick={onDelete} disabled={isBusy(`diary-del:${entry.id}`)} aria-label="Delete entry" className="px-1.5 font-display text-xl leading-none text-ink/60 hover:text-crimson">×</button>
        </span>
      </header>
      <p className="leading-relaxed break-words whitespace-pre-wrap">{entry.body}</p>
    </article>
  );
}

export function DiaryView() {
  const { data, backend, canEdit, perform } = useGame();
  const [month, setMonth] = useState(monthOf(data.today));
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // The unsaved draft is read after the first render (the server can't see this browser's storage).
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  useEffect(() => setInitialDraft(readDraft(data.today)), [data.today]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    setEntries(null);
    setError(null);
    backend.loadDiary(query ? { search: query } : { month }).then(
      (d) => {
        if (!live) return;
        setReady(d.ready);
        setEntries(d.entries);
      },
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load your diary."),
    );
    return () => {
      live = false;
    };
  }, [backend, month, query, canEdit]);

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-8">
        <PageHeader kicker="Field notes" title="Diary" />
        <p className="text-muted">The diary is private. Public entries appear in the Journal.</p>
      </main>
    );
  }

  const onSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setQuery(value.trim()), 350);
  };
  const replace = (e: DiaryEntry) => setEntries((list) => list && list.map((x) => (x.id === e.id ? e : x)));
  const added = (e: DiaryEntry) => {
    if (query || monthOf(e.day) !== month) {
      setQuery("");
      setSearch("");
      setMonth(monthOf(e.day));
    } else {
      setEntries((list) => [e, ...(list ?? [])].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)));
    }
  };
  const remove = (e: DiaryEntry) => {
    if (!window.confirm(`Delete this entry from ${longDay(e.day)}? This can't be undone.`)) return;
    void perform(`diary-del:${e.id}`, async () => {
      await backend.deleteDiary(e.id);
      return true;
    }).then((ok) => ok && setEntries((list) => list && list.filter((x) => x.id !== e.id)));
  };

  // Group by day, newest first.
  const days: [string, DiaryEntry[]][] = [];
  for (const e of entries ?? []) {
    const last = days[days.length - 1];
    if (last && last[0] === e.day) last[1].push(e);
    else days.push([e.day, [e]]);
  }
  const isThisMonth = month === monthOf(data.today);

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8">
      <PageHeader kicker="Field notes" title="Diary">
        <div className="flex flex-wrap items-center gap-3">
          {!query && (
            <div className="flex items-center gap-2">
              <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson">‹</button>
              <span className="min-w-[10.5rem] text-center font-label text-lg font-extrabold tracking-wider uppercase">{monthLabel(month)}</span>
              <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isThisMonth} aria-label="Next month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson disabled:opacity-30">›</button>
            </div>
          )}
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search all entries"
            aria-label="Search your diary"
            className="w-48 bg-ink-3 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-crimson"
          />
        </div>
      </PageHeader>

      {!ready ? (
        <Panel title="One step left">
          <p className="text-sm text-muted">
            The diary needs a one-time database update: run <code>supabase/migrations/0008_activities_diary_recaps.sql</code> in the Supabase SQL Editor.
          </p>
        </Panel>
      ) : (
        <>
          {!query && (
            <Panel title="New entry" kicker={longDay(data.today)} className="mb-10">
              {initialDraft ? <Editor editingId={null} initial={initialDraft} onSaved={added} /> : <div className="h-72" />}
            </Panel>
          )}

          {error && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}
          {query && entries && (
            <p className="mb-6 font-label font-extrabold tracking-wider text-muted uppercase">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"} with &ldquo;{query}&rdquo;
              <button onClick={() => onSearch("")} className="ml-3 text-volt hover:text-paper">Clear</button>
            </p>
          )}

          {!entries ? (
            !error && <p className="text-muted">Loading…</p>
          ) : days.length === 0 ? (
            <p className="text-muted">{query ? "Nothing matches." : `No entries in ${monthLabel(month)}.`}</p>
          ) : (
            <ol className="space-y-10">
              {days.map(([day, list]) => (
                <li key={day}>
                  <h2 className="mb-3 font-display text-2xl uppercase">
                    {day === data.today ? "Today" : day === addDays(data.today, -1) ? "Yesterday" : longDay(day)}
                  </h2>
                  <div className="space-y-5">
                    {list.map((e) =>
                      editing === e.id ? (
                        <div key={e.id} className="slash-panel border-l-4 border-volt bg-ink-2 p-5">
                          <Editor
                            editingId={e.id}
                            initial={{ day: e.day, title: e.title ?? "", body: e.body, mood: e.mood, isPublic: e.isPublic }}
                            onSaved={(saved) => {
                              setEditing(null);
                              if (saved.day !== e.day && !query) setMonth(monthOf(saved.day));
                              replace(saved);
                            }}
                            onCancel={() => setEditing(null)}
                          />
                        </div>
                      ) : (
                        <EntryCard key={e.id} entry={e} onEdit={() => setEditing(e.id)} onChange={replace} onDelete={() => remove(e)} />
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-10 text-xs text-muted">Entries are private unless you make them public. Public entries show up in your Journal for visitors.</p>
        </>
      )}
    </main>
  );
}
