// Reads iCalendar (.ics) feeds: Google Calendar's "secret address in iCal
// format" and Apple Calendar's public calendar link both use this format.
// Repeating events are expanded within the requested date range.
import ICAL from "ical.js";

export interface CalEvent {
  id: string;
  feedId: string;
  title: string;
  location: string | null;
  allDay: boolean;
  /** Timed events: ISO instant. All-day events: YYYY-MM-DD. */
  start: string;
  /** Timed: ISO instant. All-day: YYYY-MM-DD, exclusive (the day after the last day). */
  end: string;
}

const MAX_OCCURRENCES_PER_EVENT = 1000;

/** Accepts https:// and webcal:// links (webcal is just https for calendars). Throws if it doesn't look safe to fetch. */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That doesn't look like a link. Paste the full calendar address.");
  }
  if (url.protocol !== "https:") throw new Error("Calendar links must start with https:// or webcal://.");
  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIp || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new Error("That calendar address isn't allowed.");
  }
  return url.toString();
}

function toEvent(feedId: string, uid: string, title: string, location: string | null, start: ICAL.Time, end: ICAL.Time | null): CalEvent {
  const allDay = start.isDate;
  let endTime = end;
  if (!endTime) {
    endTime = start.clone();
    if (allDay) endTime.addDuration(ICAL.Duration.fromData({ days: 1 }));
  }
  const fmt = (t: ICAL.Time) => (allDay ? t.toString().slice(0, 10) : t.toJSDate().toISOString());
  const s = fmt(start);
  return { id: `${feedId}:${uid}:${s}`, feedId, title: title || "(no title)", location, allDay, start: s, end: fmt(endTime) };
}

/** Parses an .ics file and returns the events that overlap [from, to). */
export function parseIcs(text: string, feedId: string, from: Date, to: Date): CalEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error("That link didn't return a calendar file.");
  }
  if (root.name !== "vcalendar") throw new Error("That link didn't return a calendar file.");
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const zone = new ICAL.Timezone(tz);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }

  const rangeStart = ICAL.Time.fromJSDate(from, true);
  const rangeEnd = ICAL.Time.fromJSDate(to, true);
  const overlaps = (s: ICAL.Time, e: ICAL.Time) => s.compare(rangeEnd) < 0 && e.compare(rangeStart) > 0;

  // Group overrides of single occurrences ("this event only" edits) with their series.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const comp of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(comp);
    if (comp.getFirstPropertyValue("status") === "CANCELLED") continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}:${ex.recurrenceId?.toString()}`, ex);
  }

  const events: CalEvent[] = [];
  for (const ev of masters.values()) {
    const location = ev.location || null;
    if (!ev.isRecurring()) {
      if (!ev.startDate) continue;
      const start = ev.startDate;
      const end = ev.endDate ?? null;
      // Zero-length events (end == start) still count if they start inside the range.
      const startsInside = start.compare(rangeStart) >= 0 && start.compare(rangeEnd) < 0;
      if (startsInside || overlaps(start, end ?? start)) events.push(toEvent(feedId, ev.uid, ev.summary, location, start, end));
      continue;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES_PER_EVENT) {
      if (next.compare(rangeEnd) >= 0) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.item.component.getFirstPropertyValue("status") === "CANCELLED") continue;
      if (!overlaps(occ.startDate, occ.endDate)) continue;
      events.push(toEvent(feedId, ev.uid, occ.item.summary, occ.item.location || null, occ.startDate, occ.endDate));
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}
