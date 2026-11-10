import "server-only";
// Shared by all server action files. ("use server" files may only export async
// functions, so helpers like these live here.)
import { dayInTimeZone } from "@/lib/game/xp";
import { createClient } from "@/lib/supabase/server";

/** Returns a client acting as the owner, plus today's date in their time zone. Throws for anyone else. */
export async function ownerContext() {
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) throw new Error("Only the owner can do that. Try logging in again.");
  const { data: profile } = await supabase.from("profile").select("timezone").single();
  const timezone = profile?.timezone ?? "UTC";
  return { supabase, today: dayInTimeZone(new Date(), timezone), timezone };
}

/** Actions return errors as values: Next.js hides thrown error messages in production. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}


