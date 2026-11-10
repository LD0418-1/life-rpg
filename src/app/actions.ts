"use server";

// Server actions: the only code that writes to the database. XP is always
// computed here on the server from xp.json, never trusted from the browser.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findActivity } from "@/lib/game/activities";
import { loadActivities } from "@/lib/supabase/phase8-data";
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
import type { LogEntry, LogOptions, NewQuestInput, Quest, QuestEdit } from "@/lib/game/types";
import { checkPlanRest, checkUnplanRest, computeProgress } from "@/lib/game/streaks";
import { scoreEntry } from "@/lib/game/xp";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import {
  ENTRY_COLUMNS,
  type LogEntryRow,
  type MoneyTxRow,
  type PurchaseRow,
  TX_COLUMNS,
  toMoneyTx,
  toPurchase,
  QUEST_COLUMNS,
  type QuestRow,
  SEASON_COLUMNS,
  type SeasonRow,
  toLogEntry,
  toQuest,
  toSeason,
} from "@/lib/supabase/rows";
import { type NewSeasonInput, type Season, type SeasonEdit, normalizeNewSeason, normalizeSeasonEdit, seasonState } from "@/lib/game/seasons";
import { loadTotals } from "@/lib/data";
import { gameConfig } from "@/lib/game/config";
import { type LootItem, type NewLootInput, type Purchase, normalizeNewLoot } from "@/lib/game/loot";
import { type NewSkillInput, type Skill, deleteBlocker, normalizeNewSkill } from "@/lib/game/skills";
import { checkTheme } from "@/lib/game/themes";
import { SECTIONS, type Section, visibilityJson } from "@/lib/game/visibility";
import type { AchievementSync, QuestCompletion } from "@/lib/game/types";
import { type MoneyTx, normalizeTx } from "@/lib/game/finance";
import { isMissingRelation } from "@/lib/supabase/streak-data";
import { summarizeTotals } from "@/lib/game/xp";
import {
  NEEDS_0004,
  SKILL_COLUMNS,
  type SkillRow,
  isMissingFunction,
  loadAchievementStats,
  loadSkills,
  loadUnlockedAchievements,
  recordAchievements,
  toSkill,
} from "@/lib/supabase/depth-data";
import { loadStreakData } from "@/lib/supabase/streak-data";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type { ActionResult } from "@/lib/server/action-helpers";

const NEEDS_0005 = "This needs a one-time database update first: run supabase/migrations/0005_rewards_wallet_calendar.sql in the Supabase SQL Editor.";

/** Loads one active quest with its objectives. */
async function loadActiveQuest(supabase: Supabase, questId: string): Promise<Quest> {
  const { data, error } = await supabase.from("quests").select(QUEST_COLUMNS).eq("id", questId).eq("status", "active").maybeSingle<QuestRow>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That quest isn't active anymore. Refresh the page.");
  return toQuest(data);
}

// ---------- Logging ----------

export async function logActivityAction(slug: string, options: LogOptions): Promise<ActionResult<LogEntry>> {
  return run(async () => {
    const { difficulty } = options;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error("Difficulty must be 1-5.");
    const { supabase, today } = await ownerContext();
    // Your own activities and edits (0008) count, not just xp.json.
    const activity = findActivity(slug, (await loadActivities(supabase)).activities);
    const units = cleanUnits(activity, options.units);
    const note = cleanNote(options.note);

    const [{ count, error: countError }, streak] = await Promise.all([
      supabase.from("log_entries").select("id", { count: "exact", head: true }).eq("activity_slug", slug).eq("occurred_on", today),
      loadStreakData(supabase),
    ]);
    if (countError) throw new Error(countError.message);

    // Momentum from before today boosts today's activities.
    const momentumMultiplier = streak.ready ? computeProgress(streak.days, streak.restDays, today).xpMultiplier : 1;
    const score = scoreEntry(activity, { units, difficulty, repeatIndex: count ?? 0, momentumMultiplier });
    const { data, error } = await supabase
      .from("log_entries")
      .insert({
        activity_slug: slug,
        domain: activity.domain,
        units,
        difficulty,
        note,
        xp: score.xp,
        gold: score.gold,
        source: "manual",
        occurred_on: today,
      })
      .select(ENTRY_COLUMNS)
      .single<LogEntryRow>();
    if (error) throw new Error(error.message);
    return toLogEntry(data);
  });
}

export async function deleteEntryAction(entryId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase
      .from("log_entries")
      .delete()
      .eq("id", entryId)
      .not("activity_slug", "is", null) // quest rewards stay: they're tied to a finished quest
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("That entry can't be deleted (quest rewards stay), or it's already gone.");
  });
}

// ---------- Quests ----------

/** After a quest pays out: the custom reward it just put in your inventory, if it has one. */
async function latestGrant(supabase: Supabase, questId: string): Promise<Purchase | null> {
  const { data: reward, error } = await supabase.from("quest_rewards").select("quest_id").eq("quest_id", questId).maybeSingle();
  if (error || !reward) return null; // no reward, or 0005 not run yet
  const { data } = await supabase
    .from("loot_purchases")
    .select("*")
    .eq("quest_id", questId)
    .eq("source", "quest")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle<PurchaseRow>();
  return data ? toPurchase(data) : null;
}

export async function completeDailyAction(questId: string): Promise<ActionResult<QuestCompletion>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const { data, error } = await supabase.rpc("complete_daily", { p_quest_id: questId, p_day: today });
    if (error) throw new Error(error.message);
    const row = (data as LogEntryRow[] | null)?.[0];
    if (!row) return { entry: null, grant: null };
    return { entry: toLogEntry(row), grant: await latestGrant(supabase, questId) };
  });
}

export async function setObjectiveAction(questId: string, objectiveId: string, done: boolean): Promise<ActionResult<QuestCompletion>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const { data, error } = await supabase.rpc("set_objective", { p_objective_id: objectiveId, p_done: done, p_day: today });
    if (error) throw new Error(error.message);
    const row = (data as LogEntryRow[] | null)?.[0];
    if (!row) return { entry: null, grant: null };
    return { entry: toLogEntry(row), grant: await latestGrant(supabase, questId) };
  });
}

/** Saves (or removes, when empty) a quest's custom reward. */
async function saveReward(supabase: Supabase, questId: string, raw: string | undefined) {
  if (raw === undefined) return;
  const reward = cleanReward(raw);
  const { error } = reward
    ? await supabase.from("quest_rewards").upsert({ quest_id: questId, reward }, { onConflict: "quest_id" })
    : await supabase.from("quest_rewards").delete().eq("quest_id", questId);
  if (error) {
    if (isMissingRelation(error)) throw new Error(NEEDS_0005);
    throw new Error(error.message);
  }
}

export async function createQuestAction(input: NewQuestInput): Promise<ActionResult<Quest>> {
  return run(async () => {
    const quest = normalizeNewQuest(input);
    const reward = cleanReward(input.reward);
    const { supabase } = await ownerContext();
    const { data: created, error } = await supabase
      .from("quests")
      .insert({
        kind: quest.kind,
        title: quest.title,
        domain: quest.domain,
        xp_reward: quest.xpReward,
        gold_reward: quest.goldReward,
        is_boss: quest.isBoss,
        season_id: input.seasonId ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) throw new Error(error.message);

    if (quest.objectives.length) {
      const { error: objError } = await supabase
        .from("quest_objectives")
        .insert(quest.objectives.map((title, position) => ({ quest_id: created.id, title, position })));
      if (objError) {
        await supabase.from("quests").delete().eq("id", created.id); // don't leave a quest with no objectives
        throw new Error(objError.message);
      }
    }
    if (reward) await saveReward(supabase, created.id, reward);
    return loadActiveQuest(supabase, created.id);
  });
}

export async function updateQuestAction(questId: string, edit: QuestEdit): Promise<ActionResult<Quest>> {
  return run(async () => {
    const title = cleanTitle(edit.title);
    const xpReward = cleanXpReward(edit.xpReward);
    const { supabase } = await ownerContext();
    await loadActiveQuest(supabase, questId); // must exist and be active
    const { error } = await supabase
      .from("quests")
      .update({ title, xp_reward: xpReward, gold_reward: goldForQuestXp(xpReward) })
      .eq("id", questId);
    if (error) throw new Error(error.message);
    await saveReward(supabase, questId, edit.reward);
    return loadActiveQuest(supabase, questId);
  });
}

export async function addObjectiveAction(questId: string, rawTitle: string): Promise<ActionResult<Quest>> {
  return run(async () => {
    const title = cleanTitle(rawTitle, "objective");
    const { supabase } = await ownerContext();
    const quest = await loadActiveQuest(supabase, questId);
    if (quest.kind === "daily") throw new Error("Dailies don't have objectives.");
    checkAddObjective(quest);
    const { data: last } = await supabase
      .from("quest_objectives")
      .select("position")
      .eq("quest_id", questId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    const { error } = await supabase.from("quest_objectives").insert({ quest_id: questId, title, position: (last?.position ?? -1) + 1 });
    if (error) throw new Error(error.message);
    return loadActiveQuest(supabase, questId);
  });
}

export async function removeObjectiveAction(questId: string, objectiveId: string): Promise<ActionResult<Quest>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const quest = await loadActiveQuest(supabase, questId);
    checkRemoveObjective(quest, objectiveId);
    const { error } = await supabase.from("quest_objectives").delete().eq("id", objectiveId).eq("quest_id", questId).is("done_at", null);
    if (error) throw new Error(error.message);
    return loadActiveQuest(supabase, questId);
  });
}

export async function abandonQuestAction(questId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("quests").update({ status: "abandoned" }).eq("id", questId);
    if (error) throw new Error(error.message);
  });
}

// ---------- Rest days ----------

export async function planRestAction(day: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const streak = await loadStreakData(supabase);
    if (!streak.ready) throw new Error("Streaks need a one-time database update first (0003_streaks.sql).");
    const xpOnDay = streak.days.find((d) => d.day === day)?.xp ?? 0;
    checkPlanRest(day, today, streak.restDays, xpOnDay);
    const { error } = await supabase.from("rest_days").insert({ day });
    if (error) throw new Error(error.message);
  });
}

export async function unplanRestAction(day: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const streak = await loadStreakData(supabase);
    if (!streak.ready) throw new Error("Streaks need a one-time database update first (0003_streaks.sql).");
    checkUnplanRest(day, today, streak.restDays);
    const { error } = await supabase.from("rest_days").delete().eq("day", day);
    if (error) throw new Error(error.message);
  });
}

// ---------- Skill trees ----------

export async function createSkillAction(input: NewSkillInput): Promise<ActionResult<Skill>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const skill = normalizeNewSkill(input, await loadSkills(supabase));
    const { data, error } = await supabase
      .from("skills")
      .insert({
        tree: skill.tree,
        name: skill.name,
        requirement: skill.requirement,
        domain: skill.domain,
        parent_id: skill.parentId,
        xp_reward: skill.xpReward,
      })
      .select(SKILL_COLUMNS)
      .single<SkillRow>();
    if (error) throw new Error(error.message);
    return toSkill(data);
  });
}

export async function deleteSkillAction(skillId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const blocker = deleteBlocker(await loadSkills(supabase), skillId);
    if (blocker) throw new Error(blocker);
    const { error } = await supabase.from("skills").delete().eq("id", skillId).is("unlocked_at", null);
    if (error) throw new Error(error.message);
  });
}

export async function unlockSkillAction(skillId: string): Promise<ActionResult<LogEntry>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const { data: skill } = await supabase.from("skills").select("xp_reward").eq("id", skillId).maybeSingle<{ xp_reward: number }>();
    const gold = Math.round((skill?.xp_reward ?? 0) * gameConfig.gold.perXp);
    const { data, error } = await supabase.rpc("unlock_skill", { p_skill_id: skillId, p_gold: gold, p_day: today });
    if (isMissingFunction(error)) throw new Error(NEEDS_0004);
    if (error) throw new Error(error.message);
    const row = (data as LogEntryRow[] | null)?.[0];
    if (!row) throw new Error("The skill unlocked, but its reward wasn't returned. Refresh the page.");
    return toLogEntry(row);
  });
}

// ---------- Loot shop ----------

export async function createLootAction(input: NewLootInput): Promise<ActionResult<LootItem>> {
  return run(async () => {
    const item = normalizeNewLoot(input);
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("loot_items").insert(item).select("id, name, description, cost, repeatable").single<LootItem>();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function archiveLootAction(itemId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("loot_items").update({ archived: true }).eq("id", itemId);
    if (error) throw new Error(error.message);
  });
}


export async function buyLootAction(itemId: string): Promise<ActionResult<Purchase>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.rpc("buy_loot", { p_item_id: itemId });
    if (isMissingFunction(error)) throw new Error(NEEDS_0004);
    if (error) throw new Error(error.message);
    const row = (data as PurchaseRow[] | null)?.[0];
    if (!row) throw new Error("The purchase wasn't returned. Refresh the page.");
    return toPurchase(row);
  });
}

export async function redeemPurchaseAction(
  purchaseId: string,
  spent?: { amount: number; category: string },
): Promise<ActionResult<{ purchase: Purchase; tx: MoneyTx | null }>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    // Check the spend first, so a typo doesn't use up the reward.
    const spend = spent ? normalizeTx({ occurredOn: today, kind: "expense", amount: spent.amount, category: spent.category || "Rewards", note: "" }) : null;
    const { data, error } = await supabase
      .from("loot_purchases")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("id", purchaseId)
      .is("redeemed_at", null)
      .select("*")
      .maybeSingle<PurchaseRow>();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("That reward was already used.");
    const purchase = toPurchase(data);
    if (!spend) return { purchase, tx: null };
    const { data: txRow, error: txError } = await supabase
      .from("money_tx")
      .insert({ occurred_on: spend.occurredOn, kind: "expense", amount: spend.amount, category: spend.category, note: purchase.name ?? null, purchase_id: purchase.id })
      .select(TX_COLUMNS)
      .single<MoneyTxRow>();
    if (txError) throw new Error(isMissingRelation(txError) ? NEEDS_0005 : `Marked as used, but the spend wasn't saved: ${txError.message}`);
    return { purchase, tx: toMoneyTx(txRow) };
  });
}

// ---------- Seasons ----------

async function loadSeasons(supabase: Supabase): Promise<Season[]> {
  const { data, error } = await supabase.from("seasons").select(SEASON_COLUMNS).order("starts_on");
  if (error) throw new Error(error.message);
  return ((data ?? []) as SeasonRow[]).map(toSeason);
}

export async function createSeasonAction(input: NewSeasonInput): Promise<ActionResult<Season>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const season = normalizeNewSeason(input, await loadSeasons(supabase), today);
    const { data, error } = await supabase
      .from("seasons")
      .insert({ name: season.name, starts_on: season.startsOn, ends_on: season.endsOn, notes: season.notes })
      .select(SEASON_COLUMNS)
      .single<SeasonRow>();
    if (error) throw new Error(error.message);
    if (season.questIds.length) {
      const { error: pinError } = await supabase.from("quests").update({ season_id: data.id }).in("id", season.questIds).eq("status", "active");
      if (pinError) throw new Error(`The season was created, but its goals couldn't be pinned: ${pinError.message}`);
    }
    return toSeason(data);
  });
}

export async function updateSeasonAction(seasonId: string, edit: SeasonEdit): Promise<ActionResult<Season>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const seasons = await loadSeasons(supabase);
    const season = seasons.find((x) => x.id === seasonId);
    if (!season) throw new Error("That season no longer exists.");
    const clean = normalizeSeasonEdit(season, edit, seasons, today);
    const { data, error } = await supabase
      .from("seasons")
      .update({ name: clean.name, notes: clean.notes, ends_on: clean.endsOn })
      .eq("id", seasonId)
      .select(SEASON_COLUMNS)
      .single<SeasonRow>();
    if (error) throw new Error(error.message);
    return toSeason(data);
  });
}

/** Pins an active quest to a season as a goal (or unpins it with null). */
export async function setQuestSeasonAction(questId: string, seasonId: string | null): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    if (seasonId) {
      const season = (await loadSeasons(supabase)).find((x) => x.id === seasonId);
      if (!season) throw new Error("That season no longer exists.");
      if (seasonState(season, today) === "past") throw new Error("That season is over. Goals can only be added to current or upcoming seasons.");
    }
    const { data, error } = await supabase.from("quests").update({ season_id: seasonId }).eq("id", questId).eq("status", "active").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Only active quests can be pinned to a season.");
  });
}

// ---------- Achievements ----------

/** Re-checks achievements from the database and records new ones. */
export async function syncAchievementsAction(): Promise<ActionResult<AchievementSync>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const [totals, streak, skills, unlocked, { activities }] = await Promise.all([
      loadTotals(supabase),
      loadStreakData(supabase),
      loadSkills(supabase),
      loadUnlockedAchievements(supabase),
      loadActivities(supabase),
    ]);
    const stats = await loadAchievementStats(supabase, { today, totals, streak, skills, activities });
    const recorded = await recordAchievements(supabase, stats, unlocked);
    return { stats, unlocked: recorded.unlocked, newly: recorded.newly };
  });
}

// ---------- Privacy ----------

export async function setQuestPublicAction(questId: string, isPublic: boolean): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("quests").update({ is_public: isPublic }).eq("id", questId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("That quest no longer exists.");
  });
}

export async function setEntryPublicAction(entryId: string, isPublic: boolean): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("log_entries").update({ is_public: isPublic }).eq("id", entryId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("That entry no longer exists.");
  });
}

// ---------- Profile ----------

/** Saves the browser's time zone so "today" matches where you are. */
export async function setTimezoneAction(timeZone: string): Promise<ActionResult<void>> {
  return run(async () => {
    try {
      new Intl.DateTimeFormat("en", { timeZone }); // throws if invalid
    } catch {
      throw new Error("Invalid time zone.");
    }
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("profile").update({ timezone: timeZone, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
  });
}

/** Settings form. Plain form post, so it works even before JavaScript loads. */
export async function updateProfileAction(formData: FormData): Promise<void> {
  const result = await run(async () => {
    const displayName = String(formData.get("display_name") ?? "").trim().replace(/\s+/g, " ");
    const title = String(formData.get("title") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    if (!displayName) throw new Error("Your name can't be empty.");
    if (displayName.length > 40) throw new Error("Keep your name under 40 characters.");
    if (title.length > 60) throw new Error("Keep your title under 60 characters.");
    if (bio.length > 280) throw new Error("Keep your bio under 280 characters.");
    const { supabase } = await ownerContext();
    const update: Record<string, unknown> = {
      display_name: displayName,
      title: title || null,
      bio: bio || null,
      is_public: formData.get("is_public") === "on",
      updated_at: new Date().toISOString(),
    };
    if (formData.get("visibility_form") === "1") {
      const sections = Object.fromEntries(SECTIONS.map((sec) => [sec, formData.get(`show_${sec}`) === "on"])) as Record<Section, boolean>;
      const hiddenDomains = gameConfig.domains.map((d) => d.id).filter((d) => formData.get(`hide_${d}`) === "on");
      update.visibility = visibilityJson({ sections, hiddenDomains });
    }
    const theme = formData.get("theme");
    if (typeof theme === "string" && theme) {
      checkTheme(theme, summarizeTotals(await loadTotals(supabase)).overall.level);
      update.theme = theme;
    }
    const { error } = await supabase.from("profile").update(update).eq("id", 1);
    if (error) throw new Error(error.message);
  });
  revalidatePath("/", "layout");
  redirect(result.ok ? "/settings?saved=1" : `/settings?error=${encodeURIComponent(result.error)}`);
}

// ---------- Auth ----------

export async function signInAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect("/login?error=1");
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
