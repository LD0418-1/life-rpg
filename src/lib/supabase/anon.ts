import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./env";
import type { createClient } from "./server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A client with no login at all: sees exactly what a visitor sees. */
export function createAnonClient(): Supabase {
  return createSupabaseClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Supabase;
}
