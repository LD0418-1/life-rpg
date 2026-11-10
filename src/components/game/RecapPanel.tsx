"use client";

// The weekly recap at the top of the Journal. When last week has no recap yet,
// it's written automatically the first time you open the Journal.
import { useEffect, useRef, useState } from "react";
import { SlashButton } from "@/components/ui/SlashButton";
import { lastFinishedWeek, weekLabel } from "@/lib/game/recap";
import { addDays, weekStart, weekday } from "@/lib/game/streaks";
import type { RecapsData, WeeklyRecap } from "@/lib/game/types";
import { useGame } from "./GameProvider";

function ShareTextButton({ title, text, url }: { title: string; text: string; url?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else {
        await navigator.clipboard.writeText(url ? `${text}\n\n${url}` : text);
      }
      setState("done");
    } catch (err) {
      setState(err instanceof DOMException && err.name === "AbortError" ? "idle" : "error");
    }
  };
  return (
    <button onClick={share} className="skew-box bg-paper px-4 py-1 font-label text-sm font-extrabold tracking-wider text-ink uppercase hover:bg-volt">
      {state === "done" ? (typeof navigator !== "undefined" && "share" in navigator ? "Shared ✓" : "Copied ✓") : state === "error" ? "Couldn't share" : "Share ↗"}
    </button>
  );
}

export function RecapPanel() {
  const { data, backend, mode, canEdit, perform, isBusy, clearRecapDue, celebrate } = useGame();
  const [recaps, setRecaps] = useState<RecapsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useDiary, setUseDiary] = useState(true);
  const lastWeek = lastFinishedWeek(data.today);
  // On Sunday, this week's recap can already be written.
  const newestWritable = weekday(data.today) === 6 ? weekStart(data.today) : lastWeek;
  const [week, setWeek] = useState<string | null>(null);
  const autoWrote = useRef(false);

  useEffect(() => {
    let live = true;
    backend.loadRecaps().then(
      (r) => {
        if (!live) return;
        setRecaps(r);
        // ?week=YYYY-MM-DD opens a shared recap.
        const asked = new URLSearchParams(window.location.search).get("week");
        const shown = r.recaps.find((x) => x.weekStart === asked)?.weekStart ?? (canEdit ? lastWeek : r.recaps[0]?.weekStart ?? null);
        setWeek(shown);
      },
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load recaps."),
    );
    return () => {
      live = false;
    };
  }, [backend, canEdit, lastWeek]);

  const write = async (weekStart: string) => {
    const recap = await perform(`recap:${weekStart}`, () => backend.writeRecap(weekStart, { useDiary }));
    if (!recap) return;
    setRecaps((r) => r && { ...r, recaps: [recap, ...r.recaps.filter((x) => x.weekStart !== weekStart)].sort((a, b) => b.weekStart.localeCompare(a.weekStart)) });
    if (weekStart === lastWeek) clearRecapDue();
    celebrate({ kicker: "Weekly recap", title: recap.title, sub: weekLabel(weekStart) });
  };

  // Last week is over and has no recap: write it now (once).
  useEffect(() => {
    if (!recaps?.ready || !canEdit || !data.recapDue || autoWrote.current) return;
    if (recaps.recaps.some((r) => r.weekStart === lastWeek)) return;
    autoWrote.current = true;
    void write(lastWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the recaps arrive
  }, [recaps, canEdit, data.recapDue, lastWeek]);

  if (error) return <p role="alert" className="skew-box mb-8 bg-paper px-6 py-2 text-sm text-ink">{error}</p>;
  if (!recaps || week === null) {
    if (recaps && !canEdit) return null; // visitors: no public recaps yet
    return recaps ? null : <div className="mb-10 h-40 animate-pulse bg-ink-2" aria-label="Loading the weekly recap" />;
  }
  if (!recaps.ready) {
    return canEdit ? (
      <section className="slash-panel mb-10 border-l-4 border-volt bg-ink-2 p-5 text-sm text-muted">
        Weekly recaps need a one-time database update: run <code>supabase/migrations/0008_activities_diary_recaps.sql</code> in the Supabase SQL Editor.
      </section>
    ) : null;
  }

  const recap: WeeklyRecap | undefined = recaps.recaps.find((r) => r.weekStart === week);
  const writing = isBusy(`recap:${week}`);
  // Owners step week by week; visitors step through the recaps they may see.
  const visitorWeeks = recaps.recaps.map((r) => r.weekStart);
  const prev = canEdit ? addDays(week, -7) : visitorWeeks[visitorWeeks.indexOf(week) + 1];
  const next = canEdit ? (addDays(week, 7) <= newestWritable ? addDays(week, 7) : undefined) : visitorWeeks[visitorWeeks.indexOf(week) - 1];
  const hidden = new Set(data.visibility.hiddenDomains);
  const s = recap?.stats;
  const shareUrl = recap?.isPublic && mode !== "preview" && typeof window !== "undefined" ? `${window.location.origin}/journal?week=${recap.weekStart}` : undefined;

  return (
    <section aria-labelledby="recap-title" className="relative mb-12">
      <div className="mb-[-0.75rem] ml-2 flex flex-wrap items-end gap-3">
        <h2 className="relative z-10 skew-box -rotate-2 bg-volt px-5 py-1 font-display text-xl tracking-wide text-ink uppercase shadow-[4px_4px_0_var(--crimson)]">Weekly recap</h2>
        <div className="relative z-10 mb-1 flex items-center gap-2">
          <button onClick={() => prev && setWeek(prev)} disabled={!prev} aria-label="Previous week" className="bg-ink-3 px-2 font-display text-lg hover:bg-crimson disabled:opacity-30">‹</button>
          <span className="font-label text-sm font-extrabold tracking-widest uppercase">{weekLabel(week)}</span>
          <button onClick={() => next && setWeek(next)} disabled={!next} aria-label="Next week" className="bg-ink-3 px-2 font-display text-lg hover:bg-crimson disabled:opacity-30">›</button>
        </div>
      </div>
      <div className="slash-panel border-l-4 border-volt bg-ink-2 p-5 pt-8 sm:p-7 sm:pt-9">
        {writing ? (
          <div className="py-6">
            <p className="anim-stamp font-display text-3xl uppercase">Writing your recap…</p>
            <p className="mt-2 text-sm text-muted">{recaps.aiEnabled ? "Claude is reading your week." : "Adding up your week."}</p>
          </div>
        ) : recap ? (
          <>
            <div className="mb-1 flex flex-wrap items-center gap-2 font-label text-[11px] font-extrabold tracking-widest text-muted uppercase">
              <span>{recap.source === "ai" ? "Written by AI" : "Basic recap"}</span>
              {canEdit && <span className={recap.isPublic ? "text-crimson-text" : "text-volt"}>· {recap.isPublic ? "Public" : "Private"}</span>}
            </div>
            <h3 id="recap-title" className="mb-4 font-display text-4xl leading-none break-words uppercase sm:text-5xl">{recap.title}</h3>
            {s && (
              <div className="mb-5 flex flex-wrap gap-2 font-label text-sm font-extrabold tracking-wider uppercase">
                <span className="skew-box bg-crimson px-3 py-0.5">+{s.xp.toLocaleString()} XP</span>
                <span className="skew-box bg-ink-3 px-3 py-0.5">{s.activeDays}/7 active days</span>
                {s.streak.atEnd > 0 && <span className="skew-box bg-ink-3 px-3 py-0.5">{s.streak.atEnd}-day streak</span>}
                {s.level.to > s.level.from && <span className="skew-box bg-paper px-3 py-0.5 text-ink">Lv {s.level.from} → {s.level.to}</span>}
                {s.domains
                  .filter((d) => canEdit || !hidden.has(d.id))
                  .slice(0, 3)
                  .map((d) => (
                    <span key={d.id} className="skew-box border-2 border-ink-3 px-3 py-0.5">{d.label} {d.xp}</span>
                  ))}
              </div>
            )}
            <div className="max-w-2xl space-y-3 leading-relaxed">
              {recap.body.split(/\n{2,}/).map((p, i) => (
                <p key={i} className={p.startsWith("Next week:") ? "font-label text-lg font-extrabold tracking-wide text-volt" : ""}>{p}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ShareTextButton title={`${recap.title} · ${weekLabel(recap.weekStart)}`} text={`${recap.title}\n\n${recap.body}\n\n${data.displayName} · Life RPG · ${weekLabel(recap.weekStart)}`} url={shareUrl} />
              {canEdit && (
                <>
                  <button
                    onClick={() =>
                      void perform(`recap-vis:${recap.weekStart}`, async () => {
                        if (!recap.isPublic && !window.confirm("Make this recap public? Read it first: it can mention hidden domains and your diary.")) return false;
                        await backend.setRecapPublic(recap.weekStart, !recap.isPublic);
                        return true;
                      }).then((ok) => ok && setRecaps((r) => r && { ...r, recaps: r.recaps.map((x) => (x.weekStart === recap.weekStart ? { ...x, isPublic: !x.isPublic } : x)) }))
                    }
                    disabled={isBusy(`recap-vis:${recap.weekStart}`)}
                    className="font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper"
                  >
                    {recap.isPublic ? "Make private" : "🔒 Make public"}
                  </button>
                  <button
                    onClick={() => window.confirm("Write this recap again? The current text is replaced.") && void write(recap.weekStart)}
                    className="font-label text-sm font-extrabold tracking-widest text-muted uppercase hover:text-paper"
                  >
                    ↻ Rewrite
                  </button>
                </>
              )}
            </div>
          </>
        ) : canEdit ? (
          <div className="space-y-4 py-2">
            <p className="font-display text-3xl uppercase">No recap for this week yet</p>
            <div className="flex flex-wrap items-center gap-4">
              <SlashButton onClick={() => void write(week)}>✦ Write recap</SlashButton>
              {recaps.aiEnabled && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={useDiary} onChange={(e) => setUseDiary(e.target.checked)} className="h-4 w-4 accent-[var(--crimson)]" />
                  Use my diary notes
                </label>
              )}
            </div>
          </div>
        ) : (
          <p className="py-4 text-muted">No recap for this week.</p>
        )}
        {canEdit && !recaps.aiEnabled && (
          <p className="mt-5 border-t-2 border-ink-3 pt-3 text-xs text-muted">
            {mode === "preview"
              ? "The preview writes a basic recap from your numbers. On your site, Claude writes it once an Anthropic API key is set."
              : "Basic recap from your numbers. For recaps written by Claude, add ANTHROPIC_API_KEY in Vercel (see the README)."}
          </p>
        )}
      </div>
    </section>
  );
}
