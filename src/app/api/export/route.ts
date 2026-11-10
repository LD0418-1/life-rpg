// Backup / export (owner only). GET /api/export          → everything as JSON
//                                   /api/export?format=csv  → the log as a spreadsheet
//                                   /api/export?format=diary → the diary as plain text
// Secret links and tokens are never included.
import { NextResponse } from "next/server";
import { moodOf } from "@/lib/game/diary";
import { activityOf } from "@/lib/game/format";
import { dayInTimeZone } from "@/lib/game/xp";
import { loadActivities } from "@/lib/supabase/phase8-data";
import { isMissingRelation } from "@/lib/supabase/streak-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Table → columns to export. "*" = all. Secrets (calendar links, tokens) are left out. */
const TABLES: Record<string, string> = {
  profile: "*",
  log_entries: "*",
  quests: "*",
  quest_objectives: "*",
  daily_completions: "*",
  quest_rewards: "*",
  seasons: "*",
  rest_days: "*",
  skills: "*",
  achievement_unlocks: "*",
  loot_items: "*",
  loot_purchases: "*",
  money_tx: "*",
  finance_settings: "*",
  calendar_feeds: "id, name, color, created_at",
  import_items: "*",
  import_connections: "source, settings, last_synced_at, created_at",
  activity_settings: "*",
  diary_entries: "*",
  weekly_recaps: "*",
};

/** Reads a whole table, 1,000 rows at a time (the API's page size). Null if the table doesn't exist yet. */
async function readAll(supabase: Supabase, table: string, columns: string): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) {
      if (isMissingRelation(error)) return null;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** One CSV cell. Cells that start like a formula get a ' so spreadsheets don't run them. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (isOwner !== true) return NextResponse.json({ error: "Log in as the owner to download a backup." }, { status: 403 });

  const format = new URL(request.url).searchParams.get("format");
  const { data: profile } = await supabase.from("profile").select("timezone").single();
  const stamp = dayInTimeZone(new Date(), profile?.timezone ?? "UTC");

  try {
    if (format === "csv") {
      const [entries, { activities }] = await Promise.all([readAll(supabase, "log_entries", "*"), loadActivities(supabase)]);
      const header = ["day", "activity", "domain", "amount", "unit", "difficulty", "xp", "gold", "source", "note", "public"];
      const lines = (entries ?? [])
        .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))
        .map((e) => {
          const a = activityOf(e.activity_slug as string | null, activities);
          const name = a?.name ?? (e.source === "quest" ? `Quest: ${e.note ?? ""}` : (e.activity_slug ?? e.source));
          return [e.occurred_on, name, e.domain, e.units, a?.unit ?? "", e.difficulty, e.xp, e.gold, e.source, a ? e.note : "", e.is_public].map(cell).join(",");
        });
      return download([header.join(","), ...lines].join("\r\n") + "\r\n", `life-rpg-log-${stamp}.csv`, "text/csv");
    }

    if (format === "diary") {
      const notes = (await readAll(supabase, "diary_entries", "*")) ?? [];
      notes.sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.created_at).localeCompare(String(b.created_at)));
      const text = notes
        .map((n) => {
          const mood = moodOf(n.mood as number | null);
          const head = [n.day, n.title, mood ? `mood: ${mood.label}` : null].filter(Boolean).join(" · ");
          return `## ${head}\n\n${n.body}\n`;
        })
        .join("\n");
      return download(`# Diary\n\n${text || "(no entries yet)\n"}`, `life-rpg-diary-${stamp}.md`, "text/markdown");
    }

    const tables: Record<string, unknown[]> = {};
    const missing: string[] = [];
    await Promise.all(
      Object.entries(TABLES).map(async ([table, columns]) => {
        const rows = await readAll(supabase, table, columns);
        if (rows === null) missing.push(table);
        else tables[table] = rows;
      }),
    );
    const backup = {
      app: "life-rpg",
      format: 1,
      exportedAt: new Date().toISOString(),
      note: "Calendar links and connection tokens are not included.",
      ...(missing.length ? { notSetUp: missing.sort() } : {}),
      tables: Object.fromEntries(Object.keys(TABLES).filter((t) => t in tables).map((t) => [t, tables[t]])),
    };
    return download(JSON.stringify(backup, null, 2), `life-rpg-backup-${stamp}.json`, "application/json");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Backup failed." }, { status: 500 });
  }
}
