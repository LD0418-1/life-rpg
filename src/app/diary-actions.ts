"use server";

// Diary: your notes. Only you can read or write them, except entries you make public.
import { type DiaryEntry, type DiaryInput, normalizeDiaryInput, searchDiary } from "@/lib/game/diary";
import { monthRange } from "@/lib/game/finance";
import type { DiaryData } from "@/lib/game/types";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { DIARY_COLUMNS, type DiaryRow, NEEDS_0008, toDiaryEntry } from "@/lib/supabase/phase8-data";
import { isMissingRelation } from "@/lib/supabase/streak-data";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function check(error: { code?: string; message: string } | null) {
  if (error) throw new Error(isMissingRelation(error) ? NEEDS_0008 : error.message);
}

export async function loadDiaryAction(query: { month?: string; search?: string }): Promise<ActionResult<DiaryData>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    let request = supabase.from("diary_entries").select(DIARY_COLUMNS).order("day", { ascending: false }).order("created_at", { ascending: false });
    const search = query.search?.trim().slice(0, 100);
    if (!search) {
      if (!query.month || !MONTH_RE.test(query.month)) throw new Error("Bad month.");
      const { from, to } = monthRange(query.month);
      request = request.gte("day", from).lte("day", to);
    } else {
      request = request.limit(2000); // a search looks through your latest 2,000 entries
    }
    const { data, error } = await request;
    if (error) {
      if (isMissingRelation(error)) return { ready: false, entries: [] };
      throw new Error(error.message);
    }
    const entries = ((data ?? []) as DiaryRow[]).map(toDiaryEntry);
    return { ready: true, entries: search ? searchDiary(entries, search) : entries };
  });
}

export async function saveDiaryAction(input: DiaryInput, entryId?: string): Promise<ActionResult<DiaryEntry>> {
  return run(async () => {
    const { supabase, today } = await ownerContext();
    const clean = normalizeDiaryInput(input, today);
    const row = { day: clean.day, title: clean.title, body: clean.body, mood: clean.mood, is_public: clean.isPublic };
    const { data, error } = entryId
      ? await supabase.from("diary_entries").update({ ...row, updated_at: new Date().toISOString() }).eq("id", entryId).select(DIARY_COLUMNS).maybeSingle<DiaryRow>()
      : await supabase.from("diary_entries").insert(row).select(DIARY_COLUMNS).single<DiaryRow>();
    check(error);
    if (!data) throw new Error("That entry no longer exists. Refresh the page.");
    return toDiaryEntry(data);
  });
}

export async function deleteDiaryAction(entryId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { error } = await supabase.from("diary_entries").delete().eq("id", entryId);
    check(error);
  });
}

export async function setDiaryPublicAction(entryId: string, isPublic: boolean): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("diary_entries").update({ is_public: isPublic === true }).eq("id", entryId).select("id");
    check(error);
    if (!data?.length) throw new Error("That entry no longer exists. Refresh the page.");
  });
}
