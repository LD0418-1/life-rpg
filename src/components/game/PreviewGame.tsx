"use client";

import { type ReactNode, useState } from "react";
import { newlyEarned } from "@/lib/game/achievements";
import { gameConfig, getActivity } from "@/lib/game/config";
import { buyBlocker, normalizeNewLoot, type LootItem, type Purchase } from "@/lib/game/loot";
import {
  checkAddObjective,
  checkRemoveObjective,
  cleanNote,
  cleanReward,
  cleanTitle,
  cleanUnits,
  cleanXpReward,
  goldForQuestXp,
  normalizeNewQuest,
} from "@/lib/game/quests";
import { type Season, normalizeNewSeason, normalizeSeasonEdit, seasonState } from "@/lib/game/seasons";
import { type Skill, deleteBlocker, normalizeNewSkill, unlockBlocker } from "@/lib/game/skills";
import { buildStats } from "@/lib/game/stats";
import { checkPlanRest, checkUnplanRest, computeProgress } from "@/lib/game/streaks";
import type { LogEntry, Quest, SheetBackend } from "@/lib/game/types";
import { addToTotals, scoreEntry } from "@/lib/game/xp";
import { type SampleWorld, buildSampleEvents, buildSampleTxs, buildSampleWorld, sampleDailies } from "@/lib/sample-data";
import { normalizeFeedUrl } from "@/lib/calendar/ics";
import { type FinanceSettings, type MoneyTx, monthRange, normalizeFinanceSettings, normalizeTx } from "@/lib/game/finance";
import { AppShell } from "./AppShell";
import { GameProvider } from "./GameProvider";

/** In-memory backend: the same rules as the real server, nothing saved. */
function createPreviewBackend({ sheet, counts: initialCounts }: SampleWorld): SheetBackend {
  const { today } = sheet;
  const counts = { ...initialCounts };
  const entries = new Map<string, LogEntry>(sheet.recent.map((e) => [e.id, e]));
  const dayXp = new Map<string, number>(sheet.days.map((d) => [d.day, d.xp]));
  let totals = sheet.totals;
  let restDays = [...sheet.restDays];
  let skills: Skill[] = structuredClone(sheet.skills);
  const items = new Map<string, LootItem>((sheet.shop?.items ?? []).map((i) => [i.id, i]));
  let purchases: Purchase[] = structuredClone(sheet.shop?.purchases ?? []);
  let unlocked = { ...sheet.achievements.unlocked };
  let seasons: Season[] = structuredClone(sheet.seasons);
  const rewards: Record<string, string> = { ...sheet.rewards };
  let txs: MoneyTx[] = buildSampleTxs(today);
  let walletSettings: FinanceSettings = { currency: "USD", monthlyBudget: 1800 };
  const offset = new Date().getTimezoneOffset(); // sample events at local clock times
  const cal = buildSampleEvents(today, offset);
  let feeds = cal.feeds;
  /** A quest's custom reward goes into the inventory when it's finished. */
  const grantFor = (q: Quest): Purchase | null => {
    const reward = rewards[q.id];
    if (!reward) return null;
    const p: Purchase = { id: id(), itemId: null, name: reward, questId: q.id, source: "quest", cost: 0, purchasedAt: new Date().toISOString(), redeemedAt: null };
    purchases = [p, ...purchases];
    return p;
  };
  const quests = new Map<string, Quest>([...sheet.quests, ...sampleDailies].map((q) => [q.id, structuredClone(q)]));
  let n = 0;
  const id = () => `preview-${++n}`;

  const days = () => [...dayXp].map(([day, xp]) => ({ day, xp }));
  const record = (entry: LogEntry) => {
    entries.set(entry.id, entry);
    dayXp.set(entry.occurredOn, (dayXp.get(entry.occurredOn) ?? 0) + entry.xp);
    totals = addToTotals(totals, [entry]);
    return entry;
  };
  const balance = () => Object.values(totals).reduce((s, t) => s + t.gold, 0) - purchases.reduce((s, p) => s + p.cost, 0);
  const todayCount = (slug: string) => [...entries.values()].filter((e) => e.activitySlug === slug && e.occurredOn === today).length;
  const activeQuest = (questId: string) => {
    const q = quests.get(questId);
    if (!q || q.completed) throw new Error("That quest isn't active anymore.");
    return q;
  };
  const reward = (q: Quest): LogEntry =>
    record({ id: id(), source: "quest", activitySlug: null, questId: q.id, domain: q.domain, units: 1, difficulty: 3, xp: q.xpReward, gold: q.goldReward, occurredOn: today, note: q.title });

  return {
    async logActivity(slug, { difficulty, units: rawUnits, note: rawNote }) {
      const activity = getActivity(slug);
      const units = cleanUnits(activity, rawUnits);
      const note = cleanNote(rawNote) ?? undefined;
      const momentum = computeProgress(days(), restDays, today).xpMultiplier;
      const score = scoreEntry(activity, { units, difficulty, repeatIndex: todayCount(slug), momentumMultiplier: momentum });
      counts.activityEntries++;
      if (activity.unit === "minute") counts.longestMinutes = Math.max(counts.longestMinutes, units);
      return record({ id: id(), source: "manual", activitySlug: slug, domain: activity.domain, units, difficulty, xp: score.xp, gold: score.gold, occurredOn: today, note });
    },
    async deleteEntry(entryId) {
      const e = entries.get(entryId);
      if (!e || !e.activitySlug) throw new Error("That entry can't be deleted (rewards stay), or it's already gone.");
      entries.delete(entryId);
      dayXp.set(e.occurredOn, (dayXp.get(e.occurredOn) ?? 0) - e.xp);
      totals = addToTotals(totals, [{ domain: e.domain, xp: -e.xp, gold: -e.gold }]);
      counts.activityEntries--;
    },
    async completeDaily(questId) {
      const q = quests.get(questId);
      if (!q || q.doneToday) return { entry: null, grant: null };
      q.doneToday = true;
      return { entry: reward(q), grant: grantFor(q) };
    },
    async setObjective(questId, objectiveId, done) {
      const q = activeQuest(questId);
      q.objectives = q.objectives.map((o) => (o.id === objectiveId ? { ...o, done } : o));
      if (!q.objectives.every((o) => o.done)) return { entry: null, grant: null };
      q.completed = true;
      counts.questsCompleted++;
      if (q.isBoss) counts.bossesDefeated++;
      return { entry: reward(q), grant: grantFor(q) };
    },
    async createQuest(input) {
      const clean = normalizeNewQuest(input);
      const q: Quest = { ...clean, id: id(), seasonId: input.seasonId ?? null, objectives: clean.objectives.map((title) => ({ id: id(), title, done: false })) };
      quests.set(q.id, q);
      const r = cleanReward(input.reward);
      if (r) rewards[q.id] = r;
      return structuredClone(q);
    },
    async updateQuest(questId, edit) {
      const q = activeQuest(questId);
      q.title = cleanTitle(edit.title);
      q.xpReward = cleanXpReward(edit.xpReward);
      q.goldReward = goldForQuestXp(q.xpReward);
      if (edit.reward !== undefined) {
        const r = cleanReward(edit.reward);
        if (r) rewards[q.id] = r;
        else delete rewards[q.id];
      }
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
    async planRest(day) {
      checkPlanRest(day, today, restDays, dayXp.get(day) ?? 0);
      restDays = [...restDays, day];
    },
    async unplanRest(day) {
      checkUnplanRest(day, today, restDays);
      restDays = restDays.filter((d) => d !== day);
    },
    async createSkill(input) {
      const s = normalizeNewSkill(input, skills);
      const skill: Skill = { id: id(), tree: s.tree, name: s.name, requirement: s.requirement, domain: s.domain, parentId: s.parentId, xpReward: s.xpReward, unlockedAt: null };
      skills = [...skills, skill];
      return skill;
    },
    async deleteSkill(skillId) {
      const blocker = deleteBlocker(skills, skillId);
      if (blocker) throw new Error(blocker);
      skills = skills.filter((s) => s.id !== skillId);
    },
    async unlockSkill(skillId) {
      const blocker = unlockBlocker(skills, skillId);
      if (blocker) throw new Error(blocker);
      const s = skills.find((x) => x.id === skillId)!;
      skills = skills.map((x) => (x.id === skillId ? { ...x, unlockedAt: new Date().toISOString() } : x));
      return record({
        id: id(), source: "skill", activitySlug: null, domain: s.domain, units: 1, difficulty: 3,
        xp: s.xpReward, gold: Math.round(s.xpReward * gameConfig.gold.perXp), occurredOn: today, note: s.name,
      });
    },
    async createLoot(input) {
      const item: LootItem = { ...normalizeNewLoot(input), id: id() };
      items.set(item.id, item);
      return item;
    },
    async archiveLoot(itemId) {
      items.delete(itemId);
    },
    async buyLoot(itemId) {
      const item = items.get(itemId);
      if (!item) throw new Error("That reward isn't in the shop anymore.");
      const blocker = buyBlocker(item, balance(), purchases);
      if (blocker) throw new Error(blocker);
      const p: Purchase = { id: id(), itemId, cost: item.cost, purchasedAt: new Date().toISOString(), redeemedAt: null };
      purchases = [p, ...purchases];
      counts.purchases++;
      return p;
    },
    async redeemPurchase(purchaseId, spent) {
      const p = purchases.find((x) => x.id === purchaseId);
      if (!p || p.redeemedAt) throw new Error("That reward was already used.");
      const spend = spent ? normalizeTx({ occurredOn: today, kind: "expense", amount: spent.amount, category: spent.category || "Rewards", note: "" }) : null;
      p.redeemedAt = new Date().toISOString();
      let tx: MoneyTx | null = null;
      if (spend) {
        const name = p.name ?? items.get(p.itemId ?? "")?.name ?? null;
        tx = { ...spend, id: id(), note: name, purchaseId: p.id };
        txs = [tx, ...txs];
      }
      return { purchase: { ...p }, tx };
    },
    async loadWallet(month) {
      const { from, to } = monthRange(month);
      return { settings: walletSettings, txs: txs.filter((t) => t.occurredOn >= from && t.occurredOn <= to).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)) };
    },
    async addTx(input) {
      const tx: MoneyTx = { ...normalizeTx(input), id: id() };
      txs = [tx, ...txs];
      return tx;
    },
    async deleteTx(txId) {
      txs = txs.filter((t) => t.id !== txId);
    },
    async saveWalletSettings(input) {
      walletSettings = normalizeFinanceSettings(input);
      return walletSettings;
    },
    async loadCalendar(fromDay, toDay) {
      const lo = `${fromDay}`;
      const hi = `${toDay}~`;
      const shown = new Set(feeds.map((f) => f.id));
      return { feeds, events: cal.events.filter((e) => shown.has(e.feedId) && e.end >= lo && e.start <= hi), errors: [] };
    },
    async addFeed(input) {
      const url = normalizeFeedUrl(input.url);
      const feed = { id: id(), name: input.name.trim().slice(0, 40) || "Calendar", color: input.color, host: new URL(url).hostname };
      feeds = [...feeds, feed];
      return feed;
    },
    async deleteFeed(feedId) {
      feeds = feeds.filter((f) => f.id !== feedId);
    },
    async createSeason(input) {
      const clean = normalizeNewSeason(input, seasons, today);
      const season: Season = { id: id(), name: clean.name, startsOn: clean.startsOn, endsOn: clean.endsOn, notes: clean.notes };
      seasons = [...seasons, season].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
      for (const qid of clean.questIds) {
        const q = quests.get(qid);
        if (q && !q.completed) q.seasonId = season.id;
      }
      return season;
    },
    async updateSeason(seasonId, edit) {
      const season = seasons.find((x) => x.id === seasonId);
      if (!season) throw new Error("That season no longer exists.");
      const clean = normalizeSeasonEdit(season, edit, seasons, today);
      const updated = { ...season, ...clean };
      seasons = seasons.map((x) => (x.id === seasonId ? updated : x));
      return updated;
    },
    async setQuestSeason(questId, seasonId) {
      if (seasonId) {
        const season = seasons.find((x) => x.id === seasonId);
        if (!season) throw new Error("That season no longer exists.");
        if (seasonState(season, today) === "past") throw new Error("That season is over. Goals can only be added to current or upcoming seasons.");
      }
      const q = quests.get(questId);
      if (!q || q.completed) throw new Error("Only active quests can be pinned to a season.");
      q.seasonId = seasonId;
    },
    async syncAchievements() {
      const stats = buildStats({ days: days(), restDays, today, totals, skills, ...counts });
      const newly = newlyEarned(stats, unlocked);
      const now = new Date().toISOString();
      unlocked = { ...unlocked, ...Object.fromEntries(newly.map((s) => [s, now])) };
      return { stats, unlocked, newly };
    },
  };
}

/** The preview: the whole game running on sample data in your browser. */
export default function PreviewGame({ children }: { children: ReactNode }) {
  const [world] = useState(() => buildSampleWorld(new Date()));
  const [backend] = useState(() => createPreviewBackend(world));
  return (
    <GameProvider initial={world.sheet} backend={backend} mode="preview" basePath="/preview">
      <AppShell accountActions={<a href="/login" className="hover:text-paper">Owner login</a>}>{children}</AppShell>
    </GameProvider>
  );
}
