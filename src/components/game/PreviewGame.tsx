"use client";

import { type ReactNode, useState } from "react";
import { newlyEarned } from "@/lib/game/achievements";
import { gameConfig } from "@/lib/game/config";
import { type ActivityOverride, findActivity, mergeActivities, normalizeActivityInput, overrideFields, slugFor } from "@/lib/game/activities";
import { type DiaryEntry, normalizeDiaryInput, searchDiary, sortDiary } from "@/lib/game/diary";
import { basicRecap, buildWeekStats, lastFinishedWeek } from "@/lib/game/recap";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { addDays, isDay, weekday } from "@/lib/game/streaks";
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
import type { LogEntry, Quest, SheetBackend, WeeklyRecap } from "@/lib/game/types";
import { addToTotals, scoreEntry } from "@/lib/game/xp";
import { type SampleWorld, buildAllSampleEntries, buildSampleDiary, buildSampleEvents, buildSampleImports, buildSampleTxs, buildSampleWorld, sampleActivityOverrides, sampleDailies } from "@/lib/sample-data";
import { type ImportItem, mapImport, newImportToken } from "@/lib/imports/core";
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
  let importItems: ImportItem[] = buildSampleImports(today);
  let githubUser: string | null = "LD0418-1";
  let healthToken = false;
  // Full history for the Journal (the sheet itself only carries the latest 10 entries).
  const history = new Map<string, LogEntry>(buildAllSampleEntries(new Date()).map((e) => [e.id, e]));
  for (const e of entries.values()) history.set(e.id, e);
  const sampleTrophyDays = Object.entries(unlocked).map(([slug, at]) => ({ slug, day: at.slice(0, 10) }));
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

  // Quick-log activities, diary and weekly recaps.
  let overrides: ActivityOverride[] = structuredClone(sampleActivityOverrides);
  const activityList = () => mergeActivities(overrides);
  const upsertOverride = (slug: string, patch: Partial<ActivityOverride>) => {
    const blank: ActivityOverride = { slug, name: null, domain: null, unit: null, baseXp: null, xpPerUnit: null, maxUnits: null, defaultUnits: null, quick: null, hidden: false, position: null };
    const existing = overrides.find((o) => o.slug === slug);
    overrides = existing ? overrides.map((o) => (o.slug === slug ? { ...o, ...patch } : o)) : [...overrides, { ...blank, ...patch }];
  };
  let diary: DiaryEntry[] = buildSampleDiary(today);
  const recapFor = (weekStart: string): WeeklyRecap => {
    for (const e of entries.values()) history.set(e.id, e);
    const all = [...history.values()];
    const stats = buildWeekStats({
      weekStart,
      today,
      entries: all.filter((e) => e.occurredOn >= addDays(weekStart, -7)),
      totals,
      days: days(),
      restDays,
      activities: activityList(),
      quests: Object.fromEntries([...quests.values()].map((q) => [q.id, { kind: q.kind, isBoss: Boolean(q.isBoss) }])),
      trophies: sampleTrophyDays.map((t) => ({ name: ACHIEVEMENTS.find((a) => a.slug === t.slug)?.name ?? t.slug, day: t.day })),
      skills: skills.filter((s) => s.unlockedAt).map((s) => ({ name: s.name, day: s.unlockedAt!.slice(0, 10) })),
      seasons,
      seasonGoals: [...quests.values()].filter((q) => q.seasonId).map((q) => ({ seasonId: q.seasonId!, title: q.title, doneOn: q.completed ? today : null })),
      diaryEntries: diary.filter((d) => d.day >= weekStart && d.day <= addDays(weekStart, 6)).length,
    });
    return { weekStart, ...basicRecap(stats), stats, source: "basic", isPublic: false, createdAt: new Date().toISOString() };
  };
  // The week before last already has a recap; last week's is "due", to show how it's written.
  let recaps: WeeklyRecap[] = [{ ...recapFor(addDays(lastFinishedWeek(today), -7)), isPublic: true }];

  return {
    async logActivity(slug, { difficulty, units: rawUnits, note: rawNote }) {
      const activity = findActivity(slug, activityList());
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
    async loadImports() {
      return {
        ready: true,
        pending: importItems.filter((i) => i.status === "pending"),
        recent: importItems.filter((i) => i.status !== "pending").slice(0, 20),
        connections: {
          github: { username: githubUser, lastSyncedAt: githubUser ? new Date().toISOString() : null, hasToken: false },
          strava: { configured: false, connected: false, athlete: null, lastSyncedAt: null },
          health: { hasToken: healthToken, lastSyncedAt: null },
        },
      };
    },
    async syncImports() {
      return { added: 0, errors: [] };
    },
    async approveImport(itemId) {
      const it = importItems.find((i) => i.id === itemId);
      if (!it || it.status !== "pending") throw new Error("That import was already handled.");
      const { activity, units } = mapImport(it);
      const repeatIndex = [...entries.values()].filter((e) => e.activitySlug === activity.slug && e.occurredOn === it.occurredOn).length;
      const momentum = computeProgress(days(), restDays, it.occurredOn).xpMultiplier;
      const score = scoreEntry(activity, { units, difficulty: 3, repeatIndex, momentumMultiplier: momentum });
      it.status = "approved";
      counts.activityEntries++;
      return record({ id: id(), source: it.source, activitySlug: activity.slug, domain: activity.domain, units, difficulty: 3, xp: score.xp, gold: score.gold, occurredOn: it.occurredOn, note: it.title });
    },
    async ignoreImport(itemId) {
      importItems = importItems.map((i) => (i.id === itemId && i.status === "pending" ? { ...i, status: "ignored" } : i));
    },
    async restoreImport(itemId) {
      importItems = importItems.map((i) => (i.id === itemId && i.status === "ignored" ? { ...i, status: "pending" } : i));
    },
    async saveGithub(username) {
      githubUser = username?.trim() || null;
    },
    async disconnectImport(source) {
      if (source === "github") githubUser = null;
      if (source === "health") healthToken = false;
    },
    async createHealthToken() {
      healthToken = true;
      return newImportToken();
    },
    async setQuestPublic(questId, isPublic) {
      const q = quests.get(questId);
      if (q) q.isPublic = isPublic;
    },
    async setEntryPublic(entryId, isPublic) {
      for (const map of [entries, history]) {
        const e = map.get(entryId);
        if (e) map.set(entryId, { ...e, isPublic });
      }
    },
    async loadJournal(fromDay, toDay) {
      for (const e of entries.values()) history.set(e.id, e);
      const inRange = (d: string) => d >= fromDay && d <= toDay;
      return {
        entries: [...history.values()].filter((e) => inRange(e.occurredOn)).reverse(),
        trophies: sampleTrophyDays.filter((t) => inRange(t.day)),
        skills: skills.filter((s) => s.unlockedAt && inRange(s.unlockedAt.slice(0, 10))).map((s) => ({ name: s.name, tree: s.tree, day: s.unlockedAt!.slice(0, 10) })),
        notes: sortDiary(diary.filter((d) => inRange(d.day))),
      };
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
    async saveActivity(slug, input) {
      const clean = normalizeActivityInput(input);
      if (slug === null) {
        const list = activityList();
        upsertOverride(slugFor(clean.name, list.map((a) => a.slug)), { ...overrideFields(clean, undefined), position: list.length });
      } else {
        if (!activityList().some((a) => a.slug === slug)) throw new Error("That activity no longer exists.");
        upsertOverride(slug, overrideFields(clean, gameConfig.activities.find((a) => a.slug === slug)));
      }
      return activityList();
    },
    async setActivityHidden(slug, hidden) {
      upsertOverride(slug, { hidden });
      return activityList();
    },
    async resetActivity(slug) {
      if (!gameConfig.activities.some((a) => a.slug === slug)) throw new Error("Only built-in activities can be reset.");
      upsertOverride(slug, { name: null, domain: null, unit: null, baseXp: null, xpPerUnit: null, maxUnits: null, defaultUnits: null, quick: null });
      return activityList();
    },
    async deleteActivity(slug) {
      if (gameConfig.activities.some((a) => a.slug === slug)) throw new Error("Built-in activities can't be deleted, but you can hide them.");
      for (const e of entries.values()) history.set(e.id, e);
      const used = [...history.values()].some((e) => e.activitySlug === slug);
      if (used) upsertOverride(slug, { hidden: true });
      else overrides = overrides.filter((o) => o.slug !== slug);
      return { activities: activityList(), hiddenInstead: used };
    },
    async reorderActivities(order) {
      order.forEach((slug, position) => upsertOverride(slug, { position }));
      return activityList();
    },
    async loadDiary({ month, search }) {
      const list = sortDiary(diary);
      if (search?.trim()) return { ready: true, entries: searchDiary(list, search) };
      return { ready: true, entries: list.filter((d) => d.day.startsWith(month ?? "")) };
    },
    async saveDiary(input, entryId) {
      const clean = normalizeDiaryInput(input, today);
      const now = new Date().toISOString();
      if (entryId) {
        const old = diary.find((d) => d.id === entryId);
        if (!old) throw new Error("That entry no longer exists.");
        const updated = { ...old, ...clean, updatedAt: now };
        diary = diary.map((d) => (d.id === entryId ? updated : d));
        return updated;
      }
      const entry: DiaryEntry = { id: id(), ...clean, createdAt: now, updatedAt: now };
      diary = [entry, ...diary];
      return entry;
    },
    async deleteDiary(entryId) {
      diary = diary.filter((d) => d.id !== entryId);
    },
    async setDiaryPublic(entryId, isPublic) {
      diary = diary.map((d) => (d.id === entryId ? { ...d, isPublic } : d));
    },
    async loadRecaps() {
      return { ready: true, aiEnabled: false, recaps: [...recaps].sort((a, b) => b.weekStart.localeCompare(a.weekStart)) };
    },
    async writeRecap(weekStart) {
      if (!isDay(weekStart) || weekday(weekStart) !== 0) throw new Error("A week starts on a Monday.");
      if (addDays(weekStart, 6) > today) throw new Error("This week isn't over yet. Its recap can be written from Sunday.");
      await new Promise((r) => setTimeout(r, 700)); // feels like writing
      const old = recaps.find((r) => r.weekStart === weekStart);
      const recap = { ...recapFor(weekStart), isPublic: old?.isPublic ?? false };
      recaps = [recap, ...recaps.filter((r) => r.weekStart !== weekStart)];
      return recap;
    },
    async setRecapPublic(weekStart, isPublic) {
      recaps = recaps.map((r) => (r.weekStart === weekStart ? { ...r, isPublic } : r));
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
