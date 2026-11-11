// The iPhone Shortcut posts your Apple Health data here:
//   POST /api/import/health
//   Authorization: Bearer <your import token>      (or "token" in the JSON)
//   { "date": "2026-11-10", "steps": 8423, "sleep_hours": 7.4, "resting_heart_rate": 58, "heart_rate": [62, 75, 88], ... }
// Every metric is saved for the Health page. Steps, workouts, runs, mindful
// minutes and sleep also land in your Inbox; they count for XP once you approve them.
// The list of known metrics is in src/lib/health/metrics.ts (other names are kept too).
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseHealthPayload } from "@/lib/health/metrics";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const MAX_BYTES = 512_000; // a day of heart-rate samples is a few thousand numbers

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "Not set up." }, { status: 503 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "Too much data. Send fewer days at once." }, { status: 413 });
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON." }, { status: 400 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : typeof (body as { token?: unknown })?.token === "string"
      ? ((body as { token: string }).token).trim()
      : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing import token." }, { status: 401 });

  let parsed;
  try {
    // No fallback day: the server's "today" (UTC) can be a different day from yours.
    parsed = parseHealthPayload(body, null);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Bad data." }, { status: 400 });
  }

  // No login here: the database function checks the token itself.
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("ingest_health_data", { p_token: token, p_items: parsed.items, p_metrics: parsed.metrics });
  if (error) {
    const invalid = /invalid import token/i.test(error.message);
    if (invalid) return NextResponse.json({ ok: false, error: "That import token isn't valid. Make a new one in your Inbox." }, { status: 401 });
    if (error.code !== "PGRST202") return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // Before 0009: only the old XP items (no sleep, no other metrics) can be saved.
    const oldItems = parsed.items.filter((i) => i.kind !== "sleep");
    const old = await supabase.rpc("ingest_health", { p_token: token, p_items: oldItems });
    if (old.error) {
      if (old.error.code === "PGRST202") return NextResponse.json({ ok: false, error: "Imports aren't set up yet: run 0006_imports.sql in Supabase." }, { status: 503 });
      const bad = /invalid import token/i.test(old.error.message);
      return NextResponse.json({ ok: false, error: bad ? "That import token isn't valid. Make a new one in your Inbox." : old.error.message }, { status: bad ? 401 : 400 });
    }
    return NextResponse.json({
      ok: true,
      imported: old.data,
      message: `Sent ${old.data} item(s) to your inbox. To also save sleep, heart rate and the rest, run 0009_health_metrics.sql in Supabase.`,
    });
  }
  const result = data as { metrics: number; items: number };
  return NextResponse.json({
    ok: true,
    ...result,
    message: `Saved ${result.metrics} health metric(s); ${result.items} item(s) are waiting in your Life RPG inbox.`,
  });
}

export function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST JSON { date, steps, sleep_hours, heart_rate, resting_heart_rate, ... } with 'Authorization: Bearer <token>'. Values can be numbers or lists of numbers.",
  });
}
