"use client";

// Edit the quick log: add your own activities, change XP rules, hide, reorder.
import { useState } from "react";
import { SlashButton } from "@/components/ui/SlashButton";
import { ACTIVITY_LIMITS, type ActivityInput, type GameActivity, UNIT_SUGGESTIONS, moveActivity } from "@/lib/game/activities";
import { gameConfig } from "@/lib/game/config";
import { domainGlyph, unitLabel } from "@/lib/game/format";
import { scoreEntry } from "@/lib/game/xp";
import { useGame } from "./GameProvider";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-xs font-extrabold tracking-widest text-muted uppercase";

const xpRule = (a: Pick<GameActivity, "baseXp" | "xpPerUnit" | "unit">) =>
  a.unit === "session" || a.xpPerUnit === 0 ? `${a.baseXp} XP` : `${a.baseXp} + ${a.xpPerUnit}/${a.unit}`;

function ActivityForm({ initial, onSave, onCancel, busy }: { initial: ActivityInput; onSave: (input: ActivityInput) => void; onCancel: () => void; busy: boolean }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    baseXp: String(initial.baseXp),
    xpPerUnit: String(initial.xpPerUnit),
    maxUnits: String(initial.maxUnits),
    defaultUnits: String(initial.defaultUnits),
  }));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const session = form.unit.trim().toLowerCase() === "session";
  const input: ActivityInput = {
    ...form,
    baseXp: Number(form.baseXp),
    xpPerUnit: session ? 0 : Number(form.xpPerUnit),
    maxUnits: session ? 1 : Number(form.maxUnits),
    defaultUnits: session ? 1 : Number(form.defaultUnits),
  };
  const valid = Number.isFinite(input.baseXp) && Number.isFinite(input.xpPerUnit) && input.maxUnits > 0 && input.defaultUnits > 0;
  const tapXp = valid ? scoreEntry({ ...input, slug: "preview" }, { units: input.defaultUnits }).xp : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(input);
      }}
      className="space-y-3 border-l-4 border-volt bg-ink-3/40 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="act-name" className={labelClass}>Name</label>
          <input id="act-name" required maxLength={ACTIVITY_LIMITS.name} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Play guitar" className={fieldClass} autoFocus />
        </div>
        <div>
          <label htmlFor="act-domain" className={labelClass}>Domain</label>
          <select id="act-domain" value={form.domain} onChange={(e) => set({ domain: e.target.value })} className={fieldClass}>
            {gameConfig.domains.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="act-unit" className={labelClass}>Measured in</label>
          <input id="act-unit" list="act-units" required maxLength={ACTIVITY_LIMITS.unit} value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={fieldClass} />
          <datalist id="act-units">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-muted">&ldquo;session&rdquo; = one tap, no amount.</p>
        </div>
        <div>
          <label htmlFor="act-base" className={labelClass}>Base XP</label>
          <input id="act-base" type="number" inputMode="decimal" min={0} max={ACTIVITY_LIMITS.baseXp} step="any" value={form.baseXp} onChange={(e) => set({ baseXp: e.target.value })} className={fieldClass} />
        </div>
        {!session && (
          <>
            <div>
              <label htmlFor="act-per" className={labelClass}>XP per {form.unit.trim() || "unit"}</label>
              <input id="act-per" type="number" inputMode="decimal" min={0} max={ACTIVITY_LIMITS.xpPerUnit} step="any" value={form.xpPerUnit} onChange={(e) => set({ xpPerUnit: e.target.value })} className={fieldClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="act-default" className={labelClass}>One tap logs</label>
                <input id="act-default" type="number" inputMode="decimal" min={0} step="any" value={form.defaultUnits} onChange={(e) => set({ defaultUnits: e.target.value })} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="act-max" className={labelClass}>Max per entry</label>
                <input id="act-max" type="number" inputMode="decimal" min={0} max={ACTIVITY_LIMITS.maxUnits} step="any" value={form.maxUnits} onChange={(e) => set({ maxUnits: e.target.value })} className={fieldClass} />
              </div>
            </div>
          </>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={form.quick} onChange={(e) => set({ quick: e.target.checked })} className="h-4 w-4 accent-[var(--crimson)]" />
        Show as a quick-log button
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SlashButton type="submit" disabled={busy || !valid}>{busy ? "Saving…" : "Save"}</SlashButton>
        <SlashButton type="button" variant="ghost" onClick={onCancel}>Cancel</SlashButton>
        {tapXp !== null && (
          <span className="font-label text-sm font-extrabold tracking-wider text-volt uppercase">
            One tap ≈ +{tapXp} XP{session ? "" : ` for ${unitLabel(input.defaultUnits, form.unit.trim() || "unit")}`}
          </span>
        )}
      </div>
    </form>
  );
}

export function ActivityManager({ onDone }: { onDone: () => void }) {
  const { data, backend, perform, setActivities, isBusy, celebrate } = useGame();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const list = data.activities;

  if (!data.phase8Ready) {
    return (
      <div className="space-y-3 text-sm text-muted">
        <p>Editing the quick log needs a one-time database update: run <code>supabase/migrations/0008_activities_diary_recaps.sql</code> in the Supabase SQL Editor.</p>
        <SlashButton variant="ghost" onClick={onDone}>Back</SlashButton>
      </div>
    );
  }

  const save = async (slug: string | null, input: ActivityInput) => {
    const updated = await perform(`act:${slug ?? "new"}`, () => backend.saveActivity(slug, input));
    if (updated) {
      setActivities(updated);
      setEditing(null);
    }
  };
  const update = (key: string, fn: () => Promise<GameActivity[]>) => void perform(key, fn).then((updated) => updated && setActivities(updated));
  const remove = async (a: GameActivity) => {
    if (!window.confirm(`Delete "${a.name}"? If it has entries in your log, it's hidden instead so they keep their name.`)) return;
    const result = await perform(`act:${a.slug}`, () => backend.deleteActivity(a.slug));
    if (!result) return;
    setActivities(result.activities);
    if (result.hiddenInstead) celebrate({ kicker: "Kept your history", title: "Hidden instead", sub: `${a.name} has log entries, so it was hidden` });
  };
  const move = (a: GameActivity, dir: -1 | 1) => update("act:order", () => backend.reorderActivities(moveActivity(list, a.slug, dir).map((x) => x.slug)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Changes count for new entries only: your past entries keep the XP they earned. Hidden activities stay in your log and still work for imports.
      </p>
      <ul className="divide-y divide-ink-3">
        {list.map((a, i) =>
          editing === a.slug ? (
            <li key={a.slug} className="py-2">
              <ActivityForm initial={a} busy={isBusy(`act:${a.slug}`)} onSave={(input) => void save(a.slug, input)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.slug} className={`flex items-center gap-2 py-2 ${a.hidden ? "opacity-50" : ""}`}>
              <span className="flex flex-col">
                <button onClick={() => move(a, -1)} disabled={i === 0 || isBusy("act:order")} aria-label={`Move ${a.name} up`} className="px-1 leading-none text-muted hover:text-paper disabled:invisible">▲</button>
                <button onClick={() => move(a, 1)} disabled={i === list.length - 1 || isBusy("act:order")} aria-label={`Move ${a.name} down`} className="px-1 leading-none text-muted hover:text-paper disabled:invisible">▼</button>
              </span>
              <span className="w-9 shrink-0 font-label text-xs font-extrabold tracking-wider text-muted">{domainGlyph(a.domain)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-label text-lg font-extrabold tracking-wide uppercase">
                  {a.name}
                  {a.hidden && <span className="ml-2 bg-ink-3 px-1.5 text-[10px] tracking-widest text-muted">HIDDEN</span>}
                  {!a.quick && !a.hidden && <span className="ml-2 bg-ink-3 px-1.5 text-[10px] tracking-widest text-muted">NO BUTTON</span>}
                  {a.edited && <span className="ml-2 bg-volt px-1.5 text-[10px] tracking-widest text-ink">EDITED</span>}
                  {!a.builtIn && <span className="ml-2 bg-crimson px-1.5 text-[10px] tracking-widest">YOURS</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {xpRule(a)} · tap = {unitLabel(a.defaultUnits, a.unit)}
                </span>
              </span>
              <button onClick={() => setEditing(a.slug)} aria-label={`Edit ${a.name}`} className="px-1 text-muted hover:text-paper">✎</button>
              <button
                onClick={() => update(`act:${a.slug}`, () => backend.setActivityHidden(a.slug, !a.hidden))}
                disabled={isBusy(`act:${a.slug}`)}
                className="w-12 font-label text-xs font-extrabold tracking-widest text-muted uppercase hover:text-paper"
              >
                {a.hidden ? "Show" : "Hide"}
              </button>
              {a.builtIn ? (
                <button
                  onClick={() => window.confirm(`Put "${a.name}" back to its original settings?`) && update(`act:${a.slug}`, () => backend.resetActivity(a.slug))}
                  disabled={!a.edited || isBusy(`act:${a.slug}`)}
                  title="Back to the original settings"
                  className="w-12 font-label text-xs font-extrabold tracking-widest text-muted uppercase hover:text-volt disabled:invisible"
                >
                  Reset
                </button>
              ) : (
                <button onClick={() => void remove(a)} disabled={isBusy(`act:${a.slug}`)} aria-label={`Delete ${a.name}`} className="w-12 font-display text-xl text-muted hover:text-crimson">×</button>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <ActivityForm
          initial={{ name: "", domain: gameConfig.domains[0].id, unit: "minute", baseXp: 5, xpPerUnit: 1, maxUnits: 120, defaultUnits: 30, quick: true }}
          busy={isBusy("act:new")}
          onSave={(input) => void save(null, input)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          <SlashButton onClick={() => setEditing("new")}>+ New activity</SlashButton>
          <SlashButton variant="ghost" onClick={onDone}>Done</SlashButton>
        </div>
      )}
    </div>
  );
}
