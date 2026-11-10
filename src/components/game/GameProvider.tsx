"use client";

// The game's state and every action, shared by all pages (Today, Quests,
// Skills, Trophies, Shop). It lives in the layout, so switching pages is
// instant and keeps your state. It also draws the overlays: level-ups, boss
// victories, banners, the undo bar and errors.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { type Activity, gameConfig } from "@/lib/game/config";
import { activityOf, addDayXp, domainLabel } from "@/lib/game/format";
import type { LootItem, NewLootInput, Purchase } from "@/lib/game/loot";
import type { NewSeasonInput, Season, SeasonEdit } from "@/lib/game/seasons";
import type { NewSkillInput, Skill } from "@/lib/game/skills";
import { type Progress, computeProgress } from "@/lib/game/streaks";
import { effectiveTheme, themeStyle } from "@/lib/game/themes";
import type { LogEntry, LogOptions, NewQuestInput, Quest, QuestEdit, SheetBackend, SheetData } from "@/lib/game/types";
import { regionFor, stageFor } from "@/lib/game/world";
import { type CharacterSummary, addToTotals, detectLevelUp, summarizeTotals } from "@/lib/game/xp";
import { LevelUpOverlay, type LevelUpEvent } from "./LevelUpOverlay";
import { LogDialog } from "./LogDialog";
import { VictoryOverlay, type VictoryEvent } from "./VictoryOverlay";

export type GameMode = "preview" | "owner" | "visitor";

interface Floater {
  key: number;
  target: string;
  text: string;
}

interface Banner {
  key: number;
  kicker?: string;
  title: string;
  sub: string;
}

export interface Game {
  data: SheetData;
  /** For pages that load their own data (Wallet, Calendar). */
  backend: SheetBackend;
  mode: GameMode;
  canEdit: boolean;
  /** "" for the live site, "/preview" for the preview. */
  basePath: string;
  summary: CharacterSummary;
  progress: Progress;
  momentumMultiplier: number;
  goldBalance: number;
  difficulty: number;
  setDifficulty: (d: number) => void;
  isBusy: (key: string) => boolean;
  floatersFor: (target: string, size?: string) => ReactNode;
  editing: string | null;
  setEditing: (id: string | null) => void;
  openLogDialog: (a: Activity) => void;
  logActivity: (a: Activity, options?: LogOptions) => Promise<boolean>;
  removeEntry: (e: LogEntry) => void;
  completeDaily: (q: Quest) => void;
  toggleObjective: (q: Quest, objectiveId: string, done: boolean) => void;
  abandonQuest: (q: Quest) => void;
  createQuest: (input: NewQuestInput) => Promise<boolean>;
  saveQuest: (q: Quest, edit: QuestEdit) => Promise<boolean>;
  addObjective: (q: Quest, title: string) => Promise<boolean>;
  removeObjective: (q: Quest, objectiveId: string) => void;
  toggleRest: (day: string, isRest: boolean) => void;
  createSkill: (input: NewSkillInput) => Promise<Skill | undefined>;
  deleteSkill: (s: Skill) => void;
  unlockSkill: (s: Skill) => void;
  createLoot: (input: NewLootInput) => Promise<boolean>;
  archiveLoot: (item: LootItem) => void;
  buyLoot: (item: LootItem) => void;
  /** Marks an inventory item used, optionally logging what it cost. Returns true when done. */
  redeemPurchase: (p: Purchase, spent?: { amount: number; category: string }) => Promise<boolean>;
  createSeason: (input: NewSeasonInput) => Promise<boolean>;
  updateSeason: (season: Season, edit: SeasonEdit) => Promise<boolean>;
  setQuestSeason: (q: Quest, seasonId: string | null) => void;
}

const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error("useGame must be used inside <GameProvider>");
  return game;
}

export function GameProvider({
  initial,
  backend,
  mode,
  basePath,
  children,
}: {
  initial: SheetData;
  backend: SheetBackend;
  mode: GameMode;
  basePath: string;
  children: ReactNode;
}) {
  const [state, setData] = useState<SheetData>(initial);
  // Profile fields always come from the server (e.g. after saving Settings).
  const data: SheetData = {
    ...state,
    displayName: initial.displayName,
    title: initial.title,
    bio: initial.bio,
    theme: initial.theme,
    timezone: initial.timezone,
  };
  const [difficulty, setDifficulty] = useState(gameConfig.difficulty.default);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUpEvent | null>(null);
  const [victory, setVictory] = useState<VictoryEvent | null>(null);
  const pendingLevelUp = useRef<LevelUpEvent | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dialogFor, setDialogFor] = useState<Activity | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ key: number; entry: LogEntry } | null>(null);
  const canEdit = mode !== "visitor";

  const summary = summarizeTotals(data.totals);
  const progress = useMemo(() => computeProgress(data.days, data.restDays, data.today), [data.days, data.restDays, data.today]);
  const momentumMultiplier = data.streaksReady ? progress.xpMultiplier : 1;
  const theme = effectiveTheme(data.theme, summary.overall.level);

  // Show banners one after another.
  useEffect(() => {
    if (!banners.length) return;
    const t = setTimeout(() => setBanners((b) => b.slice(1)), 2400);
    return () => clearTimeout(t);
  }, [banners]);
  const pushBanner = (b: Omit<Banner, "key">) => setBanners((all) => [...all, { ...b, key: Date.now() + Math.random() }]);

  // ----- achievements: re-check shortly after anything that could earn one -----
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAchievementCheck = useCallback(() => {
    if (!canEdit) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const result = await backend.syncAchievements();
        setData((d) => ({ ...d, achievements: { stats: result.stats, unlocked: result.unlocked } }));
        for (const slug of result.newly) {
          const a = ACHIEVEMENTS.find((x) => x.slug === slug);
          if (a) pushBanner({ kicker: "Achievement unlocked", title: a.name, sub: a.description });
        }
      } catch {
        // Not critical: achievements are re-checked on the next page load.
      }
    }, 500);
  }, [backend, canEdit]);

  /** Runs a backend call with a busy flag on `key` and error reporting. */
  async function act<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (busy.has(key)) return;
    setBusy((b) => new Set(b).add(key));
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  }

  /** Adds a saved ledger entry to the screen, with the +XP pop, streak banners and level-up check. */
  function applyEntry(entry: LogEntry, target: string, bossDefeated?: Quest) {
    const up = detectLevelUp(data.totals, entry);
    const region = regionFor(entry.domain);
    if (region) {
      const after = summarizeTotals(addToTotals(data.totals, [entry]));
      const was = stageFor(summary.domains[entry.domain]?.level ?? 1);
      const now = stageFor(after.domains[entry.domain]?.level ?? 1);
      if (now > was) pushBanner({ kicker: "World upgraded", title: region.stages[now], sub: `${region.name} grew · see the World map` });
    }
    if (data.streaksReady) {
      const after = computeProgress(addDayXp(data.days, entry.occurredOn, entry.xp), data.restDays, data.today);
      if (after.shields > progress.shields) pushBanner({ title: "Shield earned!", sub: `${after.streak}-day streak · a missed day won't break it` });
      else if (after.streak > progress.streak)
        pushBanner({ title: `Streak ×${after.streak}`, sub: after.streak === 1 ? "Day one. Keep it going." : "Today counts." });
    }
    setData((d) => ({
      ...d,
      days: addDayXp(d.days, entry.occurredOn, entry.xp),
      totals: addToTotals(d.totals, [entry]),
      recent: [entry, ...d.recent].slice(0, 10),
      todayCounts: entry.activitySlug
        ? { ...d.todayCounts, [entry.activitySlug]: (d.todayCounts[entry.activitySlug] ?? 0) + 1 }
        : d.todayCounts,
    }));
    const key = Date.now() + Math.random();
    setFloaters((f) => [...f, { key, target, text: `+${entry.xp} XP` }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 1100);
    const levelEvent = up ? { key, scope: up.scope === "overall" ? "Overall" : domainLabel(up.scope), level: up.level } : null;
    if (bossDefeated) {
      setVictory({ key, title: bossDefeated.title, xp: entry.xp, gold: entry.gold });
      pendingLevelUp.current = levelEvent; // shown after the victory screen
    } else if (levelEvent) {
      setLevelUp(levelEvent);
    }
    scheduleAchievementCheck();
  }

  /** A quest's custom reward landed in the inventory. */
  function addGrant(grant: Purchase) {
    setData((d) => (d.shop ? { ...d, shop: { ...d.shop, purchases: [grant, ...d.shop.purchases] } } : d));
    pushBanner({ kicker: "Reward earned", title: grant.name ?? "Reward", sub: "It's waiting in your inventory (Shop)" });
  }

  const logActivity = async (a: Activity, options: LogOptions = { difficulty }) => {
    const saved = await act(a.slug, async () => {
      const entry = await backend.logActivity(a.slug, options);
      applyEntry(entry, a.slug);
      const key = Date.now();
      setUndo({ key, entry });
      setTimeout(() => setUndo((u) => (u?.key === key ? null : u)), 6000);
      return true as const;
    });
    return saved === true;
  };

  const removeEntry = (entry: LogEntry) =>
    act(`del:${entry.id}`, async () => {
      await backend.deleteEntry(entry.id);
      setUndo((u) => (u?.entry.id === entry.id ? null : u));
      setData((d) => {
        const counts = { ...d.todayCounts };
        if (entry.activitySlug && entry.occurredOn === d.today) counts[entry.activitySlug] = Math.max(0, (counts[entry.activitySlug] ?? 1) - 1);
        return {
          ...d,
          totals: addToTotals(d.totals, [{ domain: entry.domain, xp: -entry.xp, gold: -entry.gold }]),
          days: addDayXp(d.days, entry.occurredOn, -entry.xp),
          recent: d.recent.filter((e) => e.id !== entry.id),
          todayCounts: counts,
        };
      });
    });

  const toggleRest = (day: string, isRest: boolean) =>
    act(`rest:${day}`, async () => {
      if (isRest) await backend.unplanRest(day);
      else await backend.planRest(day);
      setData((d) => ({ ...d, restDays: isRest ? d.restDays.filter((r) => r !== day) : [...d.restDays, day] }));
    });

  const replaceQuest = (q: Quest) =>
    setData((d) => ({
      ...d,
      quests: d.quests.map((x) => (x.id === q.id ? q : x)),
      dailies: d.dailies.map((x) => (x.id === q.id ? { ...q, doneToday: x.doneToday } : x)),
    }));

  const game: Game = {
    data,
    backend,
    mode,
    canEdit,
    basePath,
    summary,
    progress,
    momentumMultiplier,
    goldBalance: summary.goldEarned - data.goldSpent,
    difficulty,
    setDifficulty,
    isBusy: (key) => busy.has(key),
    floatersFor: (target, size = "text-xl") =>
      floaters
        .filter((f) => f.target === target)
        .map((f) => (
          <span key={f.key} className={`anim-float-up pointer-events-none absolute top-0 left-1/2 z-10 bg-volt px-2 font-display text-ink ${size}`}>
            {f.text}
          </span>
        )),
    editing,
    setEditing,
    openLogDialog: setDialogFor,
    logActivity,
    removeEntry: (e) => void removeEntry(e),
    completeDaily: (q) =>
      void act(q.id, async () => {
        const { entry, grant } = await backend.completeDaily(q.id);
        setData((d) => ({ ...d, dailies: d.dailies.map((x) => (x.id === q.id ? { ...x, doneToday: true } : x)) }));
        if (entry) applyEntry(entry, q.id);
        if (grant) addGrant(grant);
      }),
    toggleObjective: (q, objectiveId, done) =>
      void act(`${q.id}:${objectiveId}`, async () => {
        const { entry: reward, grant } = await backend.setObjective(q.id, objectiveId, done);
        setData((d) => ({
          ...d,
          quests: d.quests.map((x) =>
            x.id === q.id
              ? { ...x, completed: Boolean(reward), objectives: x.objectives.map((o) => (o.id === objectiveId ? { ...o, done } : o)) }
              : x,
          ),
        }));
        if (reward) {
          setData((d) => ({ ...d, completedOn: [...d.completedOn, d.today] }));
          applyEntry(reward, q.id, q.isBoss ? q : undefined);
        }
        if (grant) addGrant(grant);
      }),
    abandonQuest: (q) => {
      if (!window.confirm(`Abandon "${q.title}"? It disappears from your quest log.`)) return;
      void act(q.id, async () => {
        await backend.abandonQuest(q.id);
        setData((d) => ({ ...d, quests: d.quests.filter((x) => x.id !== q.id), dailies: d.dailies.filter((x) => x.id !== q.id) }));
      });
    },
    createQuest: async (input) =>
      (await act("new-quest", async () => {
        const quest = await backend.createQuest(input);
        const reward = input.reward?.trim();
        setData((d) => ({
          ...(quest.kind === "daily" ? { ...d, dailies: [...d.dailies, quest] } : { ...d, quests: [...d.quests, quest] }),
          rewards: reward ? { ...d.rewards, [quest.id]: reward } : d.rewards,
        }));
        return true as const;
      })) === true,
    saveQuest: async (q, edit) =>
      (await act(`edit:${q.id}`, async () => {
        replaceQuest(await backend.updateQuest(q.id, edit));
        if (edit.reward !== undefined) {
          const reward = edit.reward.trim();
          setData((d) => {
            const rewards = { ...d.rewards };
            if (reward) rewards[q.id] = reward;
            else delete rewards[q.id];
            return { ...d, rewards };
          });
        }
        return true as const;
      })) === true,
    addObjective: async (q, title) =>
      (await act(`add:${q.id}`, async () => {
        replaceQuest(await backend.addObjective(q.id, title));
        return true as const;
      })) === true,
    removeObjective: (q, objectiveId) => void act(`rm:${objectiveId}`, async () => replaceQuest(await backend.removeObjective(q.id, objectiveId))),
    toggleRest: (day, isRest) => void toggleRest(day, isRest),
    createSkill: (input) =>
      act("new-skill", async () => {
        const skill = await backend.createSkill(input);
        setData((d) => ({ ...d, skills: [...d.skills, skill] }));
        return skill;
      }),
    deleteSkill: (s) => {
      if (!window.confirm(`Delete "${s.name}" from ${s.tree}?`)) return;
      void act(`skill:${s.id}`, async () => {
        await backend.deleteSkill(s.id);
        setData((d) => ({ ...d, skills: d.skills.filter((x) => x.id !== s.id) }));
      });
    },
    unlockSkill: (s) => {
      if (!window.confirm(`Unlock "${s.name}"?${s.requirement ? `\n\nMilestone: ${s.requirement}` : ""}\n\nUnlocked skills are permanent.`)) return;
      void act(`skill:${s.id}`, async () => {
        const reward = await backend.unlockSkill(s.id);
        const now = new Date().toISOString();
        setData((d) => ({ ...d, skills: d.skills.map((x) => (x.id === s.id ? { ...x, unlockedAt: now } : x)) }));
        applyEntry(reward, s.id);
        pushBanner({ kicker: "Skill unlocked", title: s.name, sub: `${s.tree} · +${reward.xp} XP` });
      });
    },
    createLoot: async (input) =>
      (await act("new-loot", async () => {
        const item = await backend.createLoot(input);
        setData((d) => (d.shop ? { ...d, shop: { ...d.shop, items: [...d.shop.items, item].sort((a, b) => a.cost - b.cost) } } : d));
        return true as const;
      })) === true,
    archiveLoot: (item) => {
      if (!window.confirm(`Remove "${item.name}" from the shop? Past purchases stay.`)) return;
      void act(`loot:${item.id}`, async () => {
        await backend.archiveLoot(item.id);
        setData((d) => (d.shop ? { ...d, shop: { ...d.shop, items: d.shop.items.filter((x) => x.id !== item.id) } } : d));
      });
    },
    buyLoot: (item) => {
      if (!window.confirm(`Buy "${item.name}" for ${item.cost} gold?`)) return;
      void act(`loot:${item.id}`, async () => {
        const purchase = await backend.buyLoot(item.id);
        setData((d) => ({
          ...d,
          goldSpent: d.goldSpent + purchase.cost,
          shop: d.shop ? { ...d.shop, purchases: [purchase, ...d.shop.purchases] } : d.shop,
        }));
        pushBanner({ kicker: "Loot acquired", title: item.name, sub: `−${item.cost} gold · enjoy it!` });
        scheduleAchievementCheck();
      });
    },
    redeemPurchase: async (p, spent) =>
      (await act(`purchase:${p.id}`, async () => {
        const { purchase } = await backend.redeemPurchase(p.id, spent);
        setData((d) => (d.shop ? { ...d, shop: { ...d.shop, purchases: d.shop.purchases.map((x) => (x.id === p.id ? purchase : x)) } } : d));
        return true as const;
      })) === true,
    createSeason: async (input) =>
      (await act("new-season", async () => {
        const season = await backend.createSeason(input);
        const pinned = new Set(input.questIds);
        setData((d) => ({
          ...d,
          seasons: [...d.seasons, season].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
          quests: d.quests.map((q) => (pinned.has(q.id) && !q.completed ? { ...q, seasonId: season.id } : q)),
        }));
        pushBanner({ kicker: "New season", title: season.name, sub: `${season.startsOn} → ${season.endsOn}` });
        return true as const;
      })) === true,
    updateSeason: async (season, edit) =>
      (await act(`season:${season.id}`, async () => {
        const updated = await backend.updateSeason(season.id, edit);
        setData((d) => ({ ...d, seasons: d.seasons.map((x) => (x.id === season.id ? updated : x)) }));
        return true as const;
      })) === true,
    setQuestSeason: (q, seasonId) =>
      void act(`pin:${q.id}`, async () => {
        await backend.setQuestSeason(q.id, seasonId);
        setData((d) => ({ ...d, quests: d.quests.map((x) => (x.id === q.id ? { ...x, seasonId } : x)) }));
      }),
  };

  const banner = banners[0];

  return (
    <GameContext.Provider value={game}>
      <div className="contents" style={themeStyle(theme) as React.CSSProperties}>
        {children}

        {victory && (
          <VictoryOverlay
            event={victory}
            onDone={() => {
              setVictory(null);
              if (pendingLevelUp.current) setLevelUp(pendingLevelUp.current);
              pendingLevelUp.current = null;
            }}
          />
        )}
        {!victory && levelUp && <LevelUpOverlay event={levelUp} onDone={() => setLevelUp(null)} />}

        {banner && !victory && (
          <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(1.5rem+env(safe-area-inset-top))] z-50 flex justify-center px-4">
            <div key={banner.key} className="anim-stamp anim-fade-out skew-box max-w-md bg-volt px-8 py-2 text-center text-ink shadow-[6px_6px_0_var(--ink)]">
              {banner.kicker && <div className="font-label text-xs font-extrabold tracking-[0.25em] uppercase">{banner.kicker}</div>}
              <div className="font-display text-3xl uppercase">{banner.title}</div>
              <div className="font-label text-sm font-extrabold tracking-wider uppercase">{banner.sub}</div>
            </div>
          </div>
        )}

        {dialogFor && (
          <LogDialog
            activity={dialogFor}
            momentumMultiplier={momentumMultiplier}
            initialDifficulty={difficulty}
            repeatIndex={data.todayCounts[dialogFor.slug] ?? 0}
            onSubmit={(options) => logActivity(dialogFor, options)}
            onClose={() => setDialogFor(null)}
          />
        )}

        {/* Above the phone tab bar; bottom corner on big screens. */}
        <div className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl flex-col gap-3 lg:bottom-6 lg:left-64">
          {undo && (
            <div className="skew-box flex items-center gap-3 bg-ink-3 px-6 py-3 shadow-[5px_5px_0_var(--crimson)]">
              <span className="flex-1 text-sm">
                Logged <strong>{activityOf(undo.entry.activitySlug)?.name}</strong> · +{undo.entry.xp} XP
              </span>
              <button onClick={() => void removeEntry(undo.entry)} className="font-label font-extrabold tracking-widest text-volt uppercase hover:text-paper">
                Undo
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="skew-box flex items-center gap-3 bg-paper px-6 py-3 text-ink shadow-[5px_5px_0_var(--crimson)]">
              <span className="font-label font-extrabold tracking-wider text-crimson uppercase">Error</span>
              <span className="flex-1 text-sm">{error}</span>
              <button onClick={() => setError(null)} className="font-display text-xl" aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
        </div>
      </div>
    </GameContext.Provider>
  );
}
