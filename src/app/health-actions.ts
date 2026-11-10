"use server";

// Health page: your Apple Health metrics. Owner only, never shown to visitors.
import type { MetricRow } from "@/lib/health/metrics";
import { isDay } from "@/lib/game/streaks";
import type { HealthData } from "@/lib/game/types";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { isMissingRelation } from "@/lib/supabase/streak-data";

interface MetricDbRow {
  day: string;
  metric: string;
  value: number | string;
  min_value: number | string | null;
  max_value: number | string | null;
  samples: number;
}

export async function loadHealthAction(fromDay: string, toDay: string): Promise<ActionResult<HealthData>> {
  return run(async () => {
    if (!isDay(fromDay) || !isDay(toDay) || toDay < fromDay) throw new Error("Bad date range.");
    if ((Date.parse(toDay) - Date.parse(fromDay)) / 86_400_000 > 400) throw new Error("Pick a shorter stretch of time.");
    const { supabase } = await ownerContext();
    const { data: conn } = await supabase.from("import_connections").select("token_hash, last_synced_at").eq("source", "health").maybeSingle();
    const connection = { connected: Boolean(conn?.token_hash), lastSyncedAt: (conn?.last_synced_at as string | null) ?? null };

    const rows: MetricRow[] = [];
    // 1,000 rows per page (the API's limit): 90 days × 30 metrics needs a few pages.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("health_metrics")
        .select("day, metric, value, min_value, max_value, samples")
        .gte("day", fromDay)
        .lte("day", toDay)
        .order("day")
        .order("metric")
        .range(from, from + 999);
      if (error) {
        if (isMissingRelation(error)) return { ready: false, metrics: [], ...connection };
        throw new Error(error.message);
      }
      for (const r of (data ?? []) as MetricDbRow[]) {
        rows.push({
          day: r.day,
          metric: r.metric,
          value: Number(r.value),
          min: r.min_value === null ? null : Number(r.min_value),
          max: r.max_value === null ? null : Number(r.max_value),
          samples: r.samples,
        });
      }
      if (!data || data.length < 1000) break;
    }
    return { ready: true, metrics: rows, ...connection };
  });
}
