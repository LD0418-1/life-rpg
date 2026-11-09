"use client";

import { useState } from "react";
import { getActivity } from "@/lib/game/config";
import {
  checkAddObjective,
  checkRemoveObjective,
  cleanNote,
  cleanTitle,
  cleanUnits,
  cleanXpReward,
  goldForQuestXp,
  normalizeNewQuest,
} from "@/lib/game/quests";
import type { LogEntry, Quest, SheetBackend, SheetData } from "@/lib/game/types";
import { scoreEntry } from "@/lib/game/xp";
import { buildSampleSheet, sampleDailies, sampleQuests } from "@/lib/sample-data";
import { CharacterSheet } from "./CharacterSheet";

/** In-memory backend: same rules as the real one, nothing saved. */
function createPreviewBackend(initial: SheetData): SheetBackend {
  const { today } = initial;
  const entries = new Map<string, LogEntry>(initial.recent.map((e) => [e.id, e]));
  const quests = new Map<string, Quest>([...sampleQuests, ...sampleDailies].map((q) => [q.id, structuredClone(q)]));
  let n = 0;
  const id = () => `preview-${++n}`;
  const todayCount = (slug: string) => [...entries.values()].filter((e) => e.activitySlug === slug && e.occurredOn === today).length;
  const activeQuest = (questId: string) => {
    const q = quests.get(questId);
    if (!q || q.completed) throw new Error("That quest isn't active anymore.");
    return q;
  };
  const reward = (q: Quest): LogEntry => {
    const entry = {
      id: id(), activitySlug: null, questId: q.id, domain: q.domain, units: 1, difficulty: 3,
      xp: q.xpReward, gold: q.goldReward, occurredOn: today, note: q.title,
    };
    entries.set(entry.id, entry);
    return entry;
  };

  return {
    async logActivity(slug, { difficulty, units: rawUnits, note: rawNote }) {
      const activity = getActivity(slug);
      const units = cleanUnits(activity, rawUnits);
      const note = cleanNote(rawNote) ?? undefined;
      const score = scoreEntry(activity, { units, difficulty, repeatIndex: todayCount(slug) });
      const entry: LogEntry = { id: id(), activitySlug: slug, domain: activity.domain, units, difficulty, xp: score.xp, gold: score.gold, occurredOn: today, note };
      entries.set(entry.id, entry);
      return entry;
    },
    async deleteEntry(entryId) {
      const e = entries.get(entryId);
      if (!e || !e.activitySlug) throw new Error("That entry can't be deleted (quest rewards stay), or it's already gone.");
      entries.delete(entryId);
    },
    async completeDaily(questId) {
      const q = quests.get(questId);
      if (!q || q.doneToday) return null;
      q.doneToday = true;
      return reward(q);
    },
    async setObjective(questId, objectiveId, done) {
      const q = activeQuest(questId);
      q.objectives = q.objectives.map((o) => (o.id === objectiveId ? { ...o, done } : o));
      if (!q.objectives.every((o) => o.done)) return null;
      q.completed = true;
      return reward(q);
    },
    async createQuest(input) {
      const clean = normalizeNewQuest(input);
      const q: Quest = { ...clean, id: id(), objectives: clean.objectives.map((title) => ({ id: id(), title, done: false })) };
      quests.set(q.id, q);
      return structuredClone(q);
    },
    async updateQuest(questId, edit) {
      const q = activeQuest(questId);
      q.title = cleanTitle(edit.title);
      q.xpReward = cleanXpReward(edit.xpReward);
      q.goldReward = goldForQuestXp(q.xpReward);
      return structuredClone(q);
    },
    async addObjective(questId, title) {
      const q = activeQuest(questId);
      checkAddObjective(q);
      q.objectives = [...q.objectives, { id: id(), title: cleanTitle(title, "objective"), done: false }];
      return structuredClone(q);
    },
    async removeObjective(questId, objectiveId) {
      const q = activeQuest(questId);
      checkRemoveObjective(q, objectiveId);
      q.objectives = q.objectives.filter((o) => o.id !== objectiveId);
      return structuredClone(q);
    },
    async abandonQuest(questId) {
      quests.delete(questId);
    },
  };
}

export default function PreviewSheet() {
  const [initial] = useState(() => buildSampleSheet(new Date()));
  const [backend] = useState(() => createPreviewBackend(initial));
  return <CharacterSheet initial={initial} backend={backend} mode="preview" />;
}
