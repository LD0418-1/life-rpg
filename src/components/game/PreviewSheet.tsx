"use client";

import { useState } from "react";
import { getActivity } from "@/lib/game/config";
import { normalizeNewQuest } from "@/lib/game/quests";
import type { Quest, SheetBackend } from "@/lib/game/types";
import { scoreEntry } from "@/lib/game/xp";
import { buildSampleSheet, sampleDailies, sampleQuests } from "@/lib/sample-data";
import { CharacterSheet } from "./CharacterSheet";

/** In-memory backend: same rules as the real one, nothing saved. */
function createPreviewBackend(today: string): SheetBackend {
  const counts: Record<string, number> = {};
  const quests = new Map<string, Quest>([...sampleQuests, ...sampleDailies].map((q) => [q.id, structuredClone(q)]));
  let n = 0;
  const id = () => `preview-${++n}`;
  const reward = (q: Quest) => ({
    id: id(), activitySlug: null, questId: q.id, domain: q.domain, units: 1, difficulty: 3,
    xp: q.xpReward, gold: q.goldReward, occurredOn: today, note: q.title,
  });

  return {
    async logActivity(slug, difficulty) {
      const activity = getActivity(slug);
      const score = scoreEntry(activity, { units: activity.defaultUnits, difficulty, repeatIndex: counts[slug] ?? 0 });
      counts[slug] = (counts[slug] ?? 0) + 1;
      return { id: id(), activitySlug: slug, domain: activity.domain, units: activity.defaultUnits, difficulty, xp: score.xp, gold: score.gold, occurredOn: today };
    },
    async completeDaily(questId) {
      const q = quests.get(questId);
      if (!q || q.doneToday) return null;
      q.doneToday = true;
      return reward(q);
    },
    async setObjective(questId, objectiveId, done) {
      const q = quests.get(questId);
      if (!q || q.completed) throw new Error("That quest is already finished.");
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
    async abandonQuest(questId) {
      quests.delete(questId);
    },
  };
}

export default function PreviewSheet() {
  const [initial] = useState(() => buildSampleSheet(new Date()));
  const [backend] = useState(() => createPreviewBackend(initial.today));
  return <CharacterSheet initial={initial} backend={backend} mode="preview" />;
}
