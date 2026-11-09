"use client";

import { Panel } from "@/components/ui/Panel";
import { XpBar } from "@/components/ui/XpBar";
import type { Quest } from "@/lib/game/types";
import { useGame } from "../GameProvider";
import { NewQuestForm } from "../NewQuestForm";
import { QuestEditor } from "../QuestEditor";
import { PageHeader } from "./PageHeader";

function QuestCard({ q }: { q: Quest }) {
  const { canEdit, editing, setEditing, toggleObjective, abandonQuest, saveQuest, addObjective, removeObjective, isBusy, floatersFor } = useGame();
  const done = q.objectives.filter((o) => o.done).length;
  const total = Math.max(1, q.objectives.length);
  return (
    <article className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`skew-box px-3 py-0.5 font-label text-xs font-extrabold tracking-widest uppercase ${
            q.isBoss ? "bg-volt text-ink" : q.kind === "main" ? "bg-crimson" : "bg-paper text-ink"
          }`}
        >
          {q.completed ? (q.isBoss ? "Defeated!" : "Cleared!") : q.isBoss ? "Boss" : q.kind === "main" ? "Main quest" : "Side quest"}
        </span>
        <h3 className={`font-display text-2xl uppercase ${q.completed ? "text-muted line-through" : ""}`}>{q.title}</h3>
        <span className="ml-auto font-label text-sm font-extrabold text-muted">
          +{q.xpReward} XP
          {canEdit && (
            <>
              {" "}
              · <span className="text-volt">◆{q.goldReward}</span>
            </>
          )}
        </span>
        {canEdit && !q.completed && (
          <>
            <button
              onClick={() => setEditing(editing === q.id ? null : q.id)}
              aria-label={`Edit ${q.title}`}
              aria-expanded={editing === q.id}
              className="px-1 text-muted opacity-60 hover:text-paper hover:opacity-100"
            >
              ✎
            </button>
            <button onClick={() => abandonQuest(q)} aria-label={`Abandon ${q.title}`} className="px-1 text-muted opacity-60 hover:text-crimson hover:opacity-100">
              ×
            </button>
          </>
        )}
      </div>
      {editing === q.id ? (
        <QuestEditor
          quest={q}
          onSave={(edit) => saveQuest(q, edit)}
          onAddObjective={(title) => addObjective(q, title)}
          onRemoveObjective={(objectiveId) => removeObjective(q, objectiveId)}
          onClose={() => setEditing(null)}
        />
      ) : (
        <>
          {q.isBoss ? (
            <div className="mb-2 flex items-center gap-3">
              <span className="font-label text-sm font-extrabold tracking-widest text-volt uppercase">HP</span>
              <XpBar progress={1 - done / total} label={`${q.title} boss health`} tone="volt" />
              <span className="font-label font-extrabold tabular-nums">
                {q.objectives.length - done}/{q.objectives.length}
              </span>
            </div>
          ) : (
            <div className="mb-2">
              <XpBar progress={done / total} label={`${q.title} progress`} size="sm" />
            </div>
          )}
          <ul className="grid gap-1 sm:grid-cols-2">
            {q.objectives.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => toggleObjective(q, o.id, !o.done)}
                  disabled={!canEdit || q.completed || isBusy(`${q.id}:${o.id}`)}
                  className="flex items-center gap-2 text-left text-sm"
                >
                  <span className={`h-3 w-3 shrink-0 rotate-45 ${o.done ? "bg-crimson" : "border border-muted"}`} />
                  <span className={o.done ? "text-muted line-through" : ""}>{o.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {floatersFor(q.id, "text-2xl")}
    </article>
  );
}

function QuestGroup({ title, kicker, quests, empty }: { title: string; kicker: string; quests: Quest[]; empty: string }) {
  return (
    <Panel title={title} kicker={kicker}>
      {quests.length === 0 ? <p className="py-2 text-sm text-muted">{empty}</p> : <div className="space-y-6">{quests.map((q) => <QuestCard key={q.id} q={q} />)}</div>}
    </Panel>
  );
}

export function QuestsView() {
  const { data, canEdit, createQuest } = useGame();
  const bosses = data.quests.filter((q) => q.isBoss);
  const main = data.quests.filter((q) => !q.isBoss && q.kind === "main");
  const side = data.quests.filter((q) => !q.isBoss && q.kind === "side");
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Quest log" title="Quests" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          {bosses.length > 0 && <QuestGroup title="Bosses" kicker="Dreaded tasks" quests={bosses} empty="" />}
          <QuestGroup title="Main quests" kicker="Big goals" quests={main} empty="No main quests. What's the big thing you're working toward?" />
          <QuestGroup title="Side quests" kicker="Fun extras" quests={side} empty="No side quests yet." />
        </div>
        {canEdit && (
          <div className="space-y-6">
            <NewQuestForm onCreate={createQuest} />
            <p className="text-sm text-muted">
              Dailies you create here show up on the <strong>Today</strong> page. Mark a dreaded task as a <strong>boss</strong>: its objectives
              become HP, and you get a victory screen when it falls.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
