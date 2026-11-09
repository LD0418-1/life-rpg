// Supabase settings come from environment variables (.env.local locally,
// Vercel project settings in production). Without them the site shows the
// sample-data preview instead of breaking.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.startsWith("https://") && supabaseKey.length > 0;
}
