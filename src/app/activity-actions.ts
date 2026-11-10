"use server";

// Editing the quick log: add, edit, hide, reorder and delete activities.
// Changes only affect new entries: old ones keep the XP they were given.
import { type ActivityInput, type GameActivity, normalizeActivityInput, overrideFields, slugFor } from "@/lib/game/activities";
import { gameConfig } from "@/lib/game/config";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { NEEDS_0008, loadActivities } from "@/lib/supabase/phase8-data";
import { isMissingRelation } from "@/lib/supabase/streak-data";

type Supabase = Awaited<ReturnType<typeof ownerContext>>["supabase"];

const builtIn = (slug: string) => gameConfig.activities.find((a) => a.slug === slug);

/** The owner client, plus the current list (and a clear error if 0008 hasn't been run). */
async function context() {
  const { supabase } = await ownerContext();
  const { ready, activities } = await loadActivities(supabase);
  if (!ready) throw new Error(NEEDS_0008);
  return { supabase, activities };
}

async function reload(supabase: Supabase): Promise<GameActivity[]> {
  return (await loadActivities(supabase)).activities;
}

function check(error: { code?: string; message: string } | null) {
  if (error) throw new Error(isMissingRelation(error) ? NEEDS_0008 : error.message);
}

export async function saveActivityAction(slug: string | null, input: ActivityInput): Promise<ActionResult<GameActivity[]>> {
  return run(async () => {
    const { supabase, activities } = await context();
    const clean = normalizeActivityInput(input);
    if (slug === null) {
      // A brand-new activity of your own, added at the end of the quick log.
      const newSlug = slugFor(clean.name, activities.map((a) => a.slug));
      const { error } = await supabase.from("activity_settings").insert({
        slug: newSlug,
        ...toColumns(overrideFields(clean, undefined)),
        position: activities.length,
      });
      check(error);
    } else {
      if (!activities.some((a) => a.slug === slug)) throw new Error("That activity no longer exists. Refresh the page.");
      // Built-in: store only what differs from xp.json. Yours: store everything.
      const { error } = await supabase
        .from("activity_settings")
        .upsert({ slug, ...toColumns(overrideFields(clean, builtIn(slug))), updated_at: new Date().toISOString() }, { onConflict: "slug" });
      check(error);
    }
    return reload(supabase);
  });
}

export async function setActivityHiddenAction(slug: string, hidden: boolean): Promise<ActionResult<GameActivity[]>> {
  return run(async () => {
    const { supabase, activities } = await context();
    if (!activities.some((a) => a.slug === slug)) throw new Error("That activity no longer exists. Refresh the page.");
    const { error } = await supabase.from("activity_settings").upsert({ slug, hidden: hidden === true, updated_at: new Date().toISOString() }, { onConflict: "slug" });
    check(error);
    return reload(supabase);
  });
}

export async function resetActivityAction(slug: string): Promise<ActionResult<GameActivity[]>> {
  return run(async () => {
    const { supabase } = await context();
    if (!builtIn(slug)) throw new Error("Only built-in activities can be reset.");
    const { error } = await supabase
      .from("activity_settings")
      .update({ name: null, domain: null, unit: null, base_xp: null, xp_per_unit: null, max_units: null, default_units: null, quick: null, updated_at: new Date().toISOString() })
      .eq("slug", slug);
    check(error);
    return reload(supabase);
  });
}

export async function deleteActivityAction(slug: string): Promise<ActionResult<{ activities: GameActivity[]; hiddenInstead: boolean }>> {
  return run(async () => {
    const { supabase } = await context();
    if (builtIn(slug)) throw new Error("Built-in activities can't be deleted, but you can hide them.");
    // With history, deleting would leave old entries nameless: hide it instead.
    const { count, error: countError } = await supabase.from("log_entries").select("id", { count: "exact", head: true }).eq("activity_slug", slug);
    check(countError);
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from("activity_settings").update({ hidden: true }).eq("slug", slug);
      check(error);
      return { activities: await reload(supabase), hiddenInstead: true };
    }
    const { error } = await supabase.from("activity_settings").delete().eq("slug", slug);
    check(error);
    return { activities: await reload(supabase), hiddenInstead: false };
  });
}

export async function reorderActivitiesAction(order: string[]): Promise<ActionResult<GameActivity[]>> {
  return run(async () => {
    const { supabase, activities } = await context();
    const known = new Set(activities.map((a) => a.slug));
    if (!Array.isArray(order) || order.length !== known.size || !order.every((s) => known.has(s)) || new Set(order).size !== order.length)
      throw new Error("The list changed in the meantime. Refresh the page.");
    const { error } = await supabase.from("activity_settings").upsert(
      order.map((slug, position) => ({ slug, position })),
      { onConflict: "slug" },
    );
    check(error);
    return reload(supabase);
  });
}

function toColumns(f: ReturnType<typeof overrideFields>) {
  return {
    name: f.name,
    domain: f.domain,
    unit: f.unit,
    base_xp: f.baseXp,
    xp_per_unit: f.xpPerUnit,
    max_units: f.maxUnits,
    default_units: f.defaultUnits,
    quick: f.quick,
  };
}
