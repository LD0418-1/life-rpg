import { describe, expect, it } from "vitest";
import { normalizeFeedUrl, parseIcs } from "./ics";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;

const NY_TZ = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE`;

const from = new Date("2026-11-01T00:00:00Z");
const to = new Date("2026-12-01T00:00:00Z");

describe("parseIcs", () => {
  it("reads a single timed event in UTC", () => {
    const ics = wrap(`BEGIN:VEVENT
UID:a1
DTSTART:20261110T150000Z
DTEND:20261110T160000Z
SUMMARY:Math lecture
LOCATION:Room 204
END:VEVENT`);
    expect(parseIcs(ics, "f", from, to)).toEqual([
      { id: "f:a1:2026-11-10T15:00:00.000Z", feedId: "f", title: "Math lecture", location: "Room 204", allDay: false, start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T16:00:00.000Z" },
    ]);
  });

  it("reads all-day events with an exclusive end date", () => {
    const ics = wrap(`BEGIN:VEVENT
UID:a2
DTSTART;VALUE=DATE:20261124
DTEND;VALUE=DATE:20261126
SUMMARY:Trip
END:VEVENT`);
    const [e] = parseIcs(ics, "f", from, to);
    expect(e).toMatchObject({ allDay: true, start: "2026-11-24", end: "2026-11-26", title: "Trip" });
  });

  it("converts time zones (New York, after daylight saving ends)", () => {
    const ics = wrap(`${NY_TZ}
BEGIN:VEVENT
UID:a3
DTSTART;TZID=America/New_York:20261110T090000
DTEND;TZID=America/New_York:20261110T100000
SUMMARY:Standup
END:VEVENT`);
    expect(parseIcs(ics, "f", from, to)[0].start).toBe("2026-11-10T14:00:00.000Z");
  });

  it("expands weekly repeats inside the range, skipping excluded dates and applying single-occurrence edits", () => {
    const ics = wrap(`BEGIN:VEVENT
UID:r1
DTSTART:20261002T170000Z
DTEND:20261002T180000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Gym
EXDATE:20261109T170000Z
END:VEVENT
BEGIN:VEVENT
UID:r1
RECURRENCE-ID:20261116T170000Z
DTSTART:20261116T190000Z
DTEND:20261116T200000Z
SUMMARY:Gym (late)
END:VEVENT`);
    const events = parseIcs(ics, "f", from, to);
    expect(events.map((e) => [e.start.slice(0, 16), e.title])).toEqual([
      ["2026-11-02T17:00", "Gym"],
      ["2026-11-16T19:00", "Gym (late)"],
      ["2026-11-23T17:00", "Gym"],
      ["2026-11-30T17:00", "Gym"],
    ]);
  });

  it("skips cancelled events and events outside the range", () => {
    const ics = wrap(`BEGIN:VEVENT
UID:c1
DTSTART:20261110T150000Z
DTEND:20261110T160000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:o1
DTSTART:20270110T150000Z
DTEND:20270110T160000Z
SUMMARY:Next year
END:VEVENT`);
    expect(parseIcs(ics, "f", from, to)).toEqual([]);
  });

  it("rejects things that aren't calendars", () => {
    expect(() => parseIcs("<html>nope</html>", "f", from, to)).toThrow(/calendar file/);
  });
});

describe("normalizeFeedUrl", () => {
  it("turns webcal into https", () => {
    expect(normalizeFeedUrl(" webcal://p01-caldav.icloud.com/published/2/abc ")).toBe("https://p01-caldav.icloud.com/published/2/abc");
  });
  it("accepts Google secret addresses", () => {
    expect(normalizeFeedUrl("https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics")).toMatch(/^https:\/\/calendar\.google\.com/);
  });
  it("refuses insecure, local and IP addresses", () => {
    expect(() => normalizeFeedUrl("http://example.com/cal.ics")).toThrow(/https/);
    expect(() => normalizeFeedUrl("https://localhost/cal.ics")).toThrow(/allowed/);
    expect(() => normalizeFeedUrl("https://169.254.169.254/latest")).toThrow(/allowed/);
    expect(() => normalizeFeedUrl("not a link")).toThrow(/link/);
  });
});
