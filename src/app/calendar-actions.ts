"use server";

// Calendar: reads your Google / Apple calendars through their private iCal
// links. Links are stored owner-only and never sent back to the browser.
import { type CalEvent, normalizeFeedUrl, parseIcs } from "@/lib/calendar/ics";
import { FEED_COLORS } from "@/lib/calendar/colors";
import { addDays, isDay } from "@/lib/game/streaks";
import type { CalendarData, CalendarFeed } from "@/lib/game/types";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { isMissingRelation } from "@/lib/supabase/streak-data";

const NEEDS_0005 = "The calendar needs a one-time database update first: run supabase/migrations/0005_rewards_wallet_calendar.sql in the Supabase SQL Editor.";
const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 10_000;
const CACHE_MS = 5 * 60_000;

// Short in-memory cache so flipping between months doesn't refetch every feed.
const cache = new Map<string, { at: number; text: string }>();

async function fetchIcs(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  // Follow redirects by hand so every hop passes the same safety check as the original link.
  let res: Response | null = null;
  let target = url;
  for (let hop = 0; hop < 4; hop++) {
    try {
      res = await fetch(target, {
        headers: { Accept: "text/calendar, */*", "User-Agent": "LifeRPG-Calendar/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        cache: "no-store",
      });
    } catch (e) {
      throw new Error(e instanceof Error && e.name === "TimeoutError" ? "The calendar took too long to answer." : "Couldn't reach that calendar.");
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    target = normalizeFeedUrl(new URL(location, target).toString());
    res = null;
  }
  if (!res) throw new Error("That calendar link redirects too many times.");
  if (res.status === 404 || res.status === 403 || res.status === 401) throw new Error("The calendar said no. The link may have been reset or made private.");
  if (!res.ok) throw new Error(`The calendar answered with an error (${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("That calendar is too big to load.");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("That calendar is too big to load.");
  cache.set(url, { at: Date.now(), text });
  return text;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

type FeedRow = { id: string; name: string; url: string; color: string };

export async function loadCalendarAction(fromDay: string, toDay: string): Promise<ActionResult<CalendarData>> {
  return run(async () => {
    if (!isDay(fromDay) || !isDay(toDay) || toDay < fromDay) throw new Error("Bad date range.");
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("calendar_feeds").select("id, name, url, color").order("created_at");
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0005 : error.message);
    const rows = (data ?? []) as FeedRow[];
    // A day of margin on both sides covers every time zone; the page sorts events into your local days.
    const from = new Date(`${addDays(fromDay, -1)}T00:00:00Z`);
    const to = new Date(`${addDays(toDay, 2)}T00:00:00Z`);
    const results = await Promise.all(
      rows.map(async (f): Promise<{ events: CalEvent[]; error?: string }> => {
        try {
          return { events: parseIcs(await fetchIcs(f.url), f.id, from, to) };
        } catch (e) {
          return { events: [], error: e instanceof Error ? e.message : "Couldn't load this calendar." };
        }
      }),
    );
    return {
      feeds: rows.map((f) => ({ id: f.id, name: f.name, color: f.color, host: hostOf(f.url) })),
      events: results.flatMap((r) => r.events),
      errors: results.flatMap((r, i) => (r.error ? [{ feedId: rows[i].id, message: r.error }] : [])),
    };
  });
}

export async function addFeedAction(input: { name: string; url: string; color: string }): Promise<ActionResult<CalendarFeed>> {
  return run(async () => {
    const name = input.name.trim().slice(0, 40);
    if (!name) throw new Error("Give this calendar a name.");
    const url = normalizeFeedUrl(input.url);
    const color = (FEED_COLORS as readonly string[]).includes(input.color) ? input.color : "crimson";
    const { supabase } = await ownerContext();
    // Check that it really is a calendar before saving it.
    const now = new Date();
    parseIcs(await fetchIcs(url), "check", now, new Date(now.getTime() + 30 * 86_400_000));
    const { data, error } = await supabase.from("calendar_feeds").insert({ name, url, color }).select("id, name, url, color").single<FeedRow>();
    if (error) throw new Error(isMissingRelation(error) ? NEEDS_0005 : error.message);
    return { id: data.id, name: data.name, color: data.color, host: hostOf(data.url) };
  });
}

export async function deleteFeedAction(feedId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("calendar_feeds").delete().eq("id", feedId).select("url");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) cache.delete(row.url as string);
  });
}
