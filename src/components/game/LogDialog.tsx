"use client";

import { useEffect, useRef, useState } from "react";
import { type Activity, gameConfig } from "@/lib/game/config";
import { MAX_NOTE_LENGTH } from "@/lib/game/quests";
import type { LogOptions } from "@/lib/game/types";
import { scoreEntry } from "@/lib/game/xp";
import { SlashButton } from "@/components/ui/SlashButton";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

/** Log an activity with a custom amount, difficulty and note. */
export function LogDialog({
  activity,
  initialDifficulty,
  repeatIndex,
  onSubmit,
  onClose,
}: {
  activity: Activity;
  initialDifficulty: number;
  repeatIndex: number;
  onSubmit: (options: LogOptions) => Promise<boolean>;
  onClose: () => void;
}) {
  const [units, setUnits] = useState(String(activity.defaultUnits));
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const isSession = activity.unit === "session";

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unitsNumber = isSession ? 1 : Number(units);
  const valid = Number.isFinite(unitsNumber) && unitsNumber > 0;
  const preview = valid ? scoreEntry(activity, { units: unitsNumber, difficulty, repeatIndex }) : null;
  const capped = valid && unitsNumber > activity.maxUnits;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    const ok = await onSubmit({ difficulty, units: unitsNumber, note });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/80 p-4 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="slash-panel w-full max-w-md border-l-4 border-crimson bg-ink-2 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
      >
        <p className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">Log activity</p>
        <h2 id="log-dialog-title" className="mb-5 font-display text-4xl uppercase">{activity.name}</h2>
        <form onSubmit={submit} className="space-y-4">
          {!isSession && (
            <div>
              <label htmlFor="log-units" className={labelClass}>{activity.unit}s</label>
              <input
                id="log-units"
                ref={firstField}
                type="number"
                inputMode="decimal"
                min={0.1}
                step="any"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className={`${fieldClass} font-display text-2xl`}
              />
              {capped && (
                <p className="mt-1 text-xs text-volt">XP counts up to {activity.maxUnits} {activity.unit}s per entry.</p>
              )}
            </div>
          )}
          <div>
            <span className={labelClass}>Difficulty</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(gameConfig.difficulty.labels).map(([level, label]) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setDifficulty(Number(level))}
                  aria-pressed={difficulty === Number(level)}
                  className={`skew-box px-3 py-0.5 font-label text-sm font-extrabold tracking-wider uppercase ${
                    difficulty === Number(level) ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="log-note" className={labelClass}>Note · optional</label>
            <textarea
              id="log-note"
              ref={isSession ? firstField : undefined}
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={fieldClass}
              placeholder="New personal best!"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <SlashButton type="submit" disabled={!valid || saving}>
              {saving ? "Saving…" : preview ? `Log it · +${preview.xp} XP` : "Log it"}
            </SlashButton>
            <SlashButton type="button" variant="ghost" onClick={onClose}>Cancel</SlashButton>
          </div>
          {repeatIndex > 0 && preview && (
            <p className="text-xs text-volt">
              Repeat #{repeatIndex + 1} today · XP ×{preview.breakdown.repeatMultiplier.toFixed(2)}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
