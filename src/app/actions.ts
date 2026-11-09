"use server";

// Server actions: the only code that writes to the database. XP is always
// computed here on the server from xp.json, never trusted from the browser.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import type { LogEntry, LogOptions, NewQuestInput, Quest, QuestEdit } from "@/lib/game/types";
import { dayInTimeZone, scoreEntry } from "@/lib/game/xp";
import { createClient } from "@/lib/supabase/server";
import { type LogEntryRow, QUEST_COLUMNS, type QuestRow, toLogEntry, toQuest } from "@/lib/supabase/rows";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Returns a client acting as the owner, plus today's date in their time zone. Throws for anyone else. */
async function ownerContext() {
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) throw new Error("Only the owner can do that. Try logging in again.");
  const { data: profile } = await supabase.from("profile").select("timezone").single();
  const today = dayInTimeZone(new Date(), profile?.timezone ?? "UTC");
  return { supabase, today };
}

/** Actions return errors as values: Next.js hides thrown error messages in production. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

const ENTRY_COLUMNS = "id, activity_slug, quest_id, domain, units, difficulty, note, xp, gold, occurred_on";

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
    const activity = getActivity(slug);
    const { difficulty } = options;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error("Difficulty must be 1-5.");
    const units = cleanUnits(activity, options.units);
    const note = cleanNote(options.note);
    const { supabase, today } = await ownerContext();

    const { count, error: countError } = await supabase
      .from("log_entries")
      .select("id", { count: "exact", head: true })
      .eq("activity_slug", slug)
      .eq("occurred_on", today);
    if (countError) throw new Error(countError.message);

    const score = scoreEntry(activity, { units, difficulty, repeatIndex: count ?? 0 });
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

export async function completeDailyAction(questId: string): Promise<ActionResult<LogEntry | null>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const { data, error } = await supabase.rpc("complete_daily", { p_quest_id: questId, p_day: today });
    if (error) throw new Error(error.message);
    const row = (data as LogEntryRow[] | null)?.[0];
    return row ? toLogEntry(row) : null;
  });
}

export async function setObjectiveAction(objectiveId: string, done: boolean): Promise<ActionResult<LogEntry | null>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const { data, error } = await supabase.rpc("set_objective", { p_objective_id: objectiveId, p_done: done, p_day: today });
    if (error) throw new Error(error.message);
    const row = (data as LogEntryRow[] | null)?.[0];
    return row ? toLogEntry(row) : null;
  });
}

export async function createQuestAction(input: NewQuestInput): Promise<ActionResult<Quest>> {
  return run(async () => {
    const quest = normalizeNewQuest(input);
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
    const { error } = await supabase
      .from("profile")
      .update({
        display_name: displayName,
        title: title || null,
        bio: bio || null,
        is_public: formData.get("is_public") === "on",
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
  });
  revalidatePath("/");
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
