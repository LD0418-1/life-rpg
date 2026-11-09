"use server";

// Server actions: the only code that writes to the database. XP is always
// computed here on the server from xp.json, never trusted from the browser.
import { redirect } from "next/navigation";
import { getActivity } from "@/lib/game/config";
import { normalizeNewQuest } from "@/lib/game/quests";
import type { LogEntry, NewQuestInput, Quest } from "@/lib/game/types";
import { dayInTimeZone, scoreEntry } from "@/lib/game/xp";
import { createClient } from "@/lib/supabase/server";
import { type LogEntryRow, type QuestRow, toLogEntry, toQuest } from "@/lib/supabase/rows";

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

export async function logActivityAction(slug: string, difficulty: number): Promise<ActionResult<LogEntry>> {
  return run(async () => {
    const activity = getActivity(slug);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) throw new Error("Difficulty must be 1-5.");
    const { supabase, today } = await ownerContext();

    const { count, error: countError } = await supabase
      .from("log_entries")
      .select("id", { count: "exact", head: true })
      .eq("activity_slug", slug)
      .eq("occurred_on", today);
    if (countError) throw new Error(countError.message);

    const units = activity.defaultUnits;
    const score = scoreEntry(activity, { units, difficulty, repeatIndex: count ?? 0 });
    const { data, error } = await supabase
      .from("log_entries")
      .insert({
        activity_slug: slug,
        domain: activity.domain,
        units,
        difficulty,
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

    const { data: row, error: readError } = await supabase
      .from("quests")
      .select("id, kind, title, domain, xp_reward, gold_reward, is_boss, quest_objectives(id, title, done_at, position)")
      .eq("id", created.id)
      .single<QuestRow>();
    if (readError) throw new Error(readError.message);
    return toQuest(row);
  });
}

export async function abandonQuestAction(questId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("quests").update({ status: "abandoned" }).eq("id", questId);
    if (error) throw new Error(error.message);
  });
}

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
