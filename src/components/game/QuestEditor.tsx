"use client";

import { useState } from "react";
import type { Quest, QuestEdit } from "@/lib/game/types";
import { SlashButton } from "@/components/ui/SlashButton";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

/** Inline editor for a quest or daily: title, XP, and (for quests) objectives. */
export function QuestEditor({
  quest,
  reward: initialReward,
  onSave,
  onAddObjective,
  onRemoveObjective,
  onClose,
}: {
  quest: Quest;
  /** Current custom reward; undefined hides the field (visitors, or before the 0005 update). */
  reward?: string;
  onSave: (edit: QuestEdit) => Promise<boolean>;
  onAddObjective: (title: string) => Promise<boolean>;
  onRemoveObjective: (objectiveId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(quest.title);
  const [xp, setXp] = useState(quest.xpReward);
  const [reward, setReward] = useState(initialReward ?? "");
  const [newObjective, setNewObjective] = useState("");
  const [saving, setSaving] = useState(false);
  const isDaily = quest.kind === "daily";
  const openCount = quest.objectives.filter((o) => !o.done).length;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave({ title, xpReward: xp, ...(initialReward !== undefined ? { reward } : {}) });
    setSaving(false);
    if (ok) onClose();
  };

  const add = async () => {
    if (!newObjective.trim()) return;
    if (await onAddObjective(newObjective)) setNewObjective("");
  };

  return (
    <div className="space-y-4 border-l-2 border-ink-3 pl-4">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label htmlFor={`edit-title-${quest.id}`} className={labelClass}>Title</label>
            <input id={`edit-title-${quest.id}`} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`edit-xp-${quest.id}`} className={labelClass}>XP reward</label>
            <input id={`edit-xp-${quest.id}`} type="number" min={0} max={5000} value={xp} onChange={(e) => setXp(Number(e.target.value))} className={fieldClass} />
          </div>
        </div>
        {initialReward !== undefined && (
          <div>
            <label htmlFor={`edit-reward-${quest.id}`} className={labelClass}>Your reward · optional</label>
            <input
              id={`edit-reward-${quest.id}`}
              maxLength={120}
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="Buy new clothes"
              className={fieldClass}
            />
          </div>
        )}
        <div className="flex gap-3">
          <SlashButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</SlashButton>
          <SlashButton type="button" variant="ghost" onClick={onClose}>Done</SlashButton>
        </div>
      </form>

      {!isDaily && (
        <div>
          <span className={labelClass}>Objectives</span>
          <ul className="mb-3 space-y-1">
            {quest.objectives.map((o) => {
              const removable = !o.done && openCount > 1;
              return (
                <li key={o.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-3 w-3 shrink-0 rotate-45 ${o.done ? "bg-crimson" : "border border-muted"}`} />
                  <span className={`flex-1 ${o.done ? "text-muted line-through" : ""}`}>{o.title}</span>
                  {removable && (
                    <button type="button" onClick={() => onRemoveObjective(o.id)} aria-label={`Remove objective ${o.title}`} className="px-2 text-muted hover:text-crimson">
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <input
              aria-label="New objective"
              value={newObjective}
              maxLength={120}
              onChange={(e) => setNewObjective(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className={fieldClass}
              placeholder="Add an objective"
            />
            <SlashButton type="button" variant="ghost" onClick={add}>Add</SlashButton>
          </div>
          <p className="mt-2 text-xs text-muted">Finished objectives stay. The last open one can&apos;t be removed: tick it to clear the quest.</p>
        </div>
      )}
    </div>
  );
}
