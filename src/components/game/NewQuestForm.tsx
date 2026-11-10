"use client";

import { useState } from "react";
import { gameConfig } from "@/lib/game/config";
import { DEFAULT_QUEST_XP } from "@/lib/game/quests";
import type { Season } from "@/lib/game/seasons";
import type { NewQuestInput } from "@/lib/game/types";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

/** Collapsible form for starting a new quest or daily. */
export function NewQuestForm({ onCreate, season }: { onCreate: (input: NewQuestInput) => Promise<boolean>; season?: Season | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewQuestInput["kind"]>("main");
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState(gameConfig.domains[0].id);
  const [xp, setXp] = useState(DEFAULT_QUEST_XP.main);
  const [isBoss, setIsBoss] = useState(false);
  const [forSeason, setForSeason] = useState(false);
  const [objectives, setObjectives] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <SlashButton onClick={() => setOpen(true)} className="w-full">
        + New quest
      </SlashButton>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onCreate({ kind, title, domain, xpReward: xp, isBoss, objectives: objectives.split("\n"), seasonId: forSeason && season && kind !== "daily" ? season.id : null });
    setSaving(false);
    if (ok) {
      setTitle("");
      setObjectives("");
      setIsBoss(false);
      setOpen(false);
    }
  };

  return (
    <Panel title="New quest">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["main", "side", "daily"] as const).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setXp(DEFAULT_QUEST_XP[k]);
              }}
              className={`skew-box px-4 py-1 font-label font-extrabold tracking-wider uppercase ${kind === k ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
            >
              {k === "main" ? "Main quest" : k === "side" ? "Side quest" : "Daily"}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="quest-title" className={labelClass}>Title</label>
          <input id="quest-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder={kind === "daily" ? "Stretch 10 minutes" : "Learn to play a full song"} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quest-domain" className={labelClass}>Domain</label>
            <select id="quest-domain" value={domain} onChange={(e) => setDomain(e.target.value)} className={fieldClass}>
              {gameConfig.domains.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quest-xp" className={labelClass}>XP reward</label>
            <input id="quest-xp" type="number" min={0} max={5000} value={xp} onChange={(e) => setXp(Number(e.target.value))} className={fieldClass} />
          </div>
        </div>

        {kind !== "daily" && (
          <>
            <div>
              <label htmlFor="quest-objectives" className={labelClass}>Objectives · one per line</label>
              <textarea id="quest-objectives" rows={4} value={objectives} onChange={(e) => setObjectives(e.target.value)} className={fieldClass} placeholder={"Learn the chords\nPlay it slowly\nPlay it at full speed"} />
            </div>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={isBoss} onChange={(e) => setIsBoss(e.target.checked)} className="h-4 w-4 accent-[var(--volt)]" />
              <span><span className="font-label font-extrabold tracking-wider text-volt uppercase">Boss fight</span> <span className="text-sm text-muted">· a dreaded task. Objectives become its HP.</span></span>
            </label>
            {season && (
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={forSeason} onChange={(e) => setForSeason(e.target.checked)} className="h-4 w-4 accent-[var(--volt)]" />
                <span><span className="font-label font-extrabold tracking-wider text-volt uppercase">★ Season goal</span> <span className="text-sm text-muted">· pin it to {season.name}</span></span>
              </label>
            )}
          </>
        )}

        <div className="flex gap-3">
          <SlashButton type="submit" disabled={saving}>{saving ? "Saving…" : "Start quest"}</SlashButton>
          <SlashButton type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</SlashButton>
        </div>
      </form>
    </Panel>
  );
}
