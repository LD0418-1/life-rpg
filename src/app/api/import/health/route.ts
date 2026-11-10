// The iPhone Shortcut posts your daily Apple Health totals here:
//   POST /api/import/health
//   Authorization: Bearer <your import token>      (or "token" in the JSON)
//   { "date": "2026-11-10", "steps": 8423, "workout_minutes": 35, "run_minutes": 0, "mindful_minutes": 10 }
// Items land in your Inbox as pending; nothing counts until you approve it.
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseHealthPayload } from "@/lib/imports/core";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/env";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, error: "Not set up." }, { status: 503 });
  const text = await request.text();
  if (text.length > 10_000) return NextResponse.json({ ok: false, error: "Too much data." }, { status: 413 });
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

  let items;
  try {
    items = parseHealthPayload(body, new Date().toISOString().slice(0, 10));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Bad data." }, { status: 400 });
  }

  // No login here: the database function checks the token itself.
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("ingest_health", { p_token: token, p_items: items });
  if (error) {
    if (error.code === "PGRST202") {
      return NextResponse.json({ ok: false, error: "Imports aren't set up yet: run 0006_imports.sql in Supabase." }, { status: 503 });
    }
    const invalid = /invalid import token/i.test(error.message);
    return NextResponse.json({ ok: false, error: invalid ? "That import token isn't valid. Make a new one in your Inbox." : error.message }, { status: invalid ? 401 : 400 });
  }
  return NextResponse.json({ ok: true, imported: data, message: `Sent ${data} item(s) to your Life RPG inbox.` });
}

export function GET() {
  return NextResponse.json({ ok: true, usage: "POST JSON { date, steps, workout_minutes, run_minutes, mindful_minutes } with 'Authorization: Bearer <token>'." });
}
