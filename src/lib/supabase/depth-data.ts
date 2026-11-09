import "server-only";
import { type AchievementStats, newlyEarned } from "@/lib/game/achievements";
import { gameConfig } from "@/lib/game/config";
import type { LootItem, Purchase } from "@/lib/game/loot";
import type { Skill } from "@/lib/game/skills";
import { buildStats } from "@/lib/game/stats";
import type { DomainTotals } from "@/lib/game/xp";
import type { createClient } from "./server";
import type { StreakData } from "./streak-data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const SKILL_COLUMNS = "id, tree, name, requirement, domain, parent_id, xp_reward, unlocked_at";

export interface SkillRow {
  id: string;
  tree: string;
  name: string;
  requirement: string | null;
  domain: string | null;
  parent_id: string | null;
  xp_reward: number;
  unlocked_at: string | null;
}

export function toSkill(r: SkillRow): Skill {
  return {
    id: r.id, tree: r.tree, name: r.name, requirement: r.requirement, domain: r.domain ?? "craft",
    parentId: r.parent_id, xpReward: r.xp_reward, unlockedAt: r.unlocked_at,
  };
}

/** Supabase can't find a function: the 0004 database script hasn't been run. */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "")));
}

export const NEEDS_0004 = "This needs a one-time database update first: run supabase/migrations/0004_depth.sql in the Supabase SQL Editor.";

function check<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return res;
}

export async function loadSkills(supabase: Supabase): Promise<Skill[]> {
  const res = check(await supabase.from("skills").select(SKILL_COLUMNS).order("tree").order("name"), "skills");
  return ((res.data ?? []) as SkillRow[]).map(toSkill);
}

export async function loadShop(supabase: Supabase): Promise<{ items: LootItem[]; purchases: Purchase[] }> {
  const [items, purchases] = await Promise.all([
    supabase.from("loot_items").select("id, name, description, cost, repeatable").eq("archived", false).order("cost"),
    supabase.from("loot_purchases").select("id, item_id, cost, purchased_at, redeemed_at").order("purchased_at", { ascending: false }),
  ]);
  check(items, "the shop");
  check(purchases, "your purchases");
  return {
    items: (items.data ?? []) as LootItem[],
    purchases: (purchases.data ?? []).map((p) => ({
      id: p.id as string, itemId: p.item_id as string, cost: p.cost as number,
      purchasedAt: p.purchased_at as string, redeemedAt: p.redeemed_at as string | null,
    })),
  };
}

/** Gold spent in the shop (only the owner can see purchases). */
export async function loadGoldSpent(supabase: Supabase): Promise<number> {
  const res = check(await supabase.from("loot_purchases").select("cost"), "your purchases");
  return (res.data ?? []).reduce((sum, p) => sum + Number(p.cost), 0);
}

/** Everything achievements are judged on, straight from the database. */
export async function loadAchievementStats(
  supabase: Supabase,
  input: { today: string; totals: DomainTotals; streak: StreakData; skills: Skill[] },
): Promise<AchievementStats> {
  const minuteSlugs = gameConfig.activities.filter((a) => a.unit === "minute").map((a) => a.slug);
  const [entries, quests, purchases, longest] = await Promise.all([
    supabase.from("log_entries").select("id", { count: "exact", head: true }).not("activity_slug", "is", null),
    supabase.from("quests").select("is_boss").eq("status", "completed").neq("kind", "daily"),
    supabase.from("loot_purchases").select("id", { count: "exact", head: true }),
    supabase.from("log_entries").select("units").in("activity_slug", minuteSlugs).order("units", { ascending: false }).limit(1),
  ]);
  check(entries, "your log");
  check(quests, "your quests");
  check(longest, "your log");
  const done = quests.data ?? [];
  return buildStats({
    days: input.streak.days,
    restDays: input.streak.restDays,
    today: input.today,
    totals: input.totals,
    skills: input.skills,
    activityEntries: entries.count ?? 0,
    questsCompleted: done.length,
    bossesDefeated: done.filter((q) => q.is_boss).length,
    purchases: purchases.count ?? 0, // visitors can't see purchases: counts as 0 for them
    longestMinutes: Number(longest.data?.[0]?.units ?? 0),
  });
}

export async function loadUnlockedAchievements(supabase: Supabase): Promise<Record<string, string>> {
  const res = check(await supabase.from("achievement_unlocks").select("slug, unlocked_at"), "achievements");
  return Object.fromEntries((res.data ?? []).map((r) => [r.slug as string, r.unlocked_at as string]));
}

/** Records achievements the stats have earned (owner only). Returns the new slugs. */
export async function recordAchievements(
  supabase: Supabase,
  stats: AchievementStats,
  unlocked: Record<string, string>,
): Promise<{ unlocked: Record<string, string>; newly: string[] }> {
  const newly = newlyEarned(stats, unlocked);
  if (!newly.length) return { unlocked, newly };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("achievement_unlocks")
    .upsert(newly.map((slug) => ({ slug, unlocked_at: now })), { onConflict: "slug", ignoreDuplicates: true });
  if (error) throw new Error(`Could not save achievements: ${error.message}`);
  return { unlocked: { ...unlocked, ...Object.fromEntries(newly.map((s) => [s, now])) }, newly };
}
