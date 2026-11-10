// Weekly recap: the numbers for one week (Monday to Sunday), a plain recap
// built from them, and the instructions + data sent to Claude for the AI one.
// Everything here is pure, so the preview and the server share it.
import type { Activity } from "./config";
import { gameConfig } from "./config";
import type { DiaryEntry } from "./diary";
import { domainLabel } from "./format";
import { type Season, currentSeason, rankFor, daysBetween } from "./seasons";
import { type DayXp, addDays, computeProgress, weekStart } from "./streaks";
import type { LogEntry } from "./types";
import { type DomainTotals, addToTotals, summarizeTotals } from "./xp";

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  xp: number;
  prevWeekXp: number;
  activeDays: number;
  restDays: number;
  bestDay: { day: string; xp: number } | null;
  level: { from: number; to: number };
  /** Domains with XP this week, most first. */
  domains: { id: string; label: string; xp: number; levelFrom: number; levelTo: number }[];
  /** Most XP first, at most 5. */
  topActivities: { name: string; times: number; amount: number; unit: string; xp: number }[];
  questsCleared: string[];
  bossesDefeated: string[];
  dailiesDone: number;
  trophies: string[];
  skills: string[];
  streak: { atEnd: number; best: number; shields: number };
  season: { name: string; dayNumber: number; totalDays: number; rank: string; goalsDone: number; goalsTotal: number; goalsDoneThisWeek: string[] } | null;
  diaryEntries: number;
}

export interface WeekInput {
  weekStart: string;
  /** Today (YYYY-MM-DD), so the totals can be wound back to the end of the week. */
  today: string;
  /** Every ledger entry from the Monday BEFORE weekStart up to today. */
  entries: ReadonlyArray<LogEntry>;
  /** Current totals per domain. */
  totals: DomainTotals;
  days: ReadonlyArray<DayXp>;
  restDays: ReadonlyArray<string>;
  activities: ReadonlyArray<Activity>;
  /** Kind and boss flag of the quests that paid out in the week. */
  quests: Record<string, { kind: string; isBoss: boolean }>;
  trophies: ReadonlyArray<{ name: string; day: string }>;
  skills: ReadonlyArray<{ name: string; day: string }>;
  seasons: ReadonlyArray<Season>;
  /** Every season goal, with the day it was completed (or null). */
  seasonGoals: ReadonlyArray<{ seasonId: string; title: string; doneOn: string | null }>;
  diaryEntries: number;
}

/** The week before the current one: the latest week that's over. */
export const lastFinishedWeek = (today: string) => addDays(weekStart(today), -7);

/** "Nov 3 – 9" or "Oct 27 – Nov 2". */
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { ...opts, timeZone: "UTC" });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
}

export function buildWeekStats(input: WeekInput): WeekStats {
  const start = input.weekStart;
  const end = addDays(start, 6);
  const inWeek = (d: string) => d >= start && d <= end;
  const week = input.entries.filter((e) => inWeek(e.occurredOn));
  const prevStart = addDays(start, -7);
  const prevWeekXp = input.entries.filter((e) => e.occurredOn >= prevStart && e.occurredOn < start).reduce((s, e) => s + e.xp, 0);

  // Totals at the end of the week = now minus everything logged after it; at the start = that minus the week.
  const after = input.entries.filter((e) => e.occurredOn > end);
  const atEnd = addToTotals(input.totals, after.map((e) => ({ domain: e.domain, xp: -e.xp, gold: -e.gold })));
  const atStart = addToTotals(atEnd, week.map((e) => ({ domain: e.domain, xp: -e.xp, gold: -e.gold })));
  const sumEnd = summarizeTotals(atEnd);
  const sumStart = summarizeTotals(atStart);

  const xpByDay = new Map<string, number>();
  for (const e of week) xpByDay.set(e.occurredOn, (xpByDay.get(e.occurredOn) ?? 0) + e.xp);
  const minXp = gameConfig.streak.minXpPerDay;
  const best = [...xpByDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  const domainXp = new Map<string, number>();
  for (const e of week) domainXp.set(e.domain, (domainXp.get(e.domain) ?? 0) + e.xp);
  const domains = [...domainXp]
    .filter(([, xp]) => xp > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, xp]) => ({ id, label: domainLabel(id), xp, levelFrom: sumStart.domains[id]?.level ?? 1, levelTo: sumEnd.domains[id]?.level ?? 1 }));

  const acts = new Map<string, { name: string; times: number; amount: number; unit: string; xp: number }>();
  for (const e of week) {
    if (!e.activitySlug) continue;
    const a = input.activities.find((x) => x.slug === e.activitySlug);
    const row = acts.get(e.activitySlug) ?? { name: a?.name ?? e.activitySlug, times: 0, amount: 0, unit: a?.unit ?? "session", xp: 0 };
    row.times++;
    row.amount += e.units;
    row.xp += e.xp;
    acts.set(e.activitySlug, row);
  }
  const topActivities = [...acts.values()]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5)
    .map((a) => ({ ...a, amount: Math.round(a.amount * 10) / 10 }));

  const questsCleared: string[] = [];
  const bossesDefeated: string[] = [];
  let dailiesDone = 0;
  for (const e of week) {
    if (e.source !== "quest" || !e.questId) continue;
    const q = input.quests[e.questId];
    if (q?.kind === "daily") dailiesDone++;
    else if (q?.isBoss) bossesDefeated.push(e.note ?? "A boss");
    else questsCleared.push(e.note ?? "A quest");
  }

  const days = input.days.filter((d) => d.day <= end);
  const progress = computeProgress(days, input.restDays, end);

  const season = currentSeason(input.seasons, end) ?? input.seasons.find((s) => s.endsOn >= start && s.endsOn <= end) ?? null;
  let seasonOut: WeekStats["season"] = null;
  if (season) {
    const totalDays = daysBetween(season.startsOn, season.endsOn) + 1;
    const last = season.endsOn < end ? season.endsOn : end;
    const elapsed = daysBetween(season.startsOn, last) + 1;
    const dayXp = new Map(input.days.map((d) => [d.day, d.xp]));
    let active = 0;
    for (let i = 0; i < elapsed; i++) if ((dayXp.get(addDays(season.startsOn, i)) ?? 0) >= minXp) active++;
    const goals = input.seasonGoals.filter((g) => g.seasonId === season.id);
    seasonOut = {
      name: season.name,
      dayNumber: Math.min(totalDays, elapsed),
      totalDays,
      rank: rankFor(active, elapsed),
      goalsDone: goals.filter((g) => g.doneOn && g.doneOn <= end).length,
      goalsTotal: goals.length,
      goalsDoneThisWeek: goals.filter((g) => g.doneOn && inWeek(g.doneOn)).map((g) => g.title),
    };
  }

  return {
    weekStart: start,
    weekEnd: end,
    xp: week.reduce((s, e) => s + e.xp, 0),
    prevWeekXp,
    activeDays: [...xpByDay.values()].filter((xp) => xp >= minXp).length,
    restDays: input.restDays.filter(inWeek).length,
    bestDay: best ? { day: best[0], xp: best[1] } : null,
    level: { from: sumStart.overall.level, to: sumEnd.overall.level },
    domains,
    topActivities,
    questsCleared,
    bossesDefeated,
    dailiesDone,
    trophies: input.trophies.filter((t) => inWeek(t.day)).map((t) => t.name),
    skills: input.skills.filter((s) => inWeek(s.day)).map((s) => s.name),
    streak: { atEnd: progress.streak, best: progress.bestStreak, shields: progress.shields },
    season: seasonOut,
    diaryEntries: input.diaryEntries,
  };
}

const weekdayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** A recap without AI, from the numbers alone. Used when no Anthropic key is set, and in the preview. */
export function basicRecap(s: WeekStats): { title: string; body: string } {
  if (s.xp === 0) {
    return {
      title: s.restDays > 0 ? "A week of rest" : "A quiet week",
      body: `Nothing was logged between ${weekLabel(s.weekStart)}. ${s.streak.atEnd > 0 ? `Your streak still stands at ${s.streak.atEnd} days.` : "Every streak starts with day one."} Pick one small thing for Monday and the next chapter begins.`,
    };
  }
  const top = s.domains[0];
  const ups = s.domains.filter((d) => d.levelTo > d.levelFrom);
  const title =
    s.bossesDefeated.length > 0
      ? `Boss down: ${s.bossesDefeated[0]}`
      : s.level.to > s.level.from
        ? `Level ${s.level.to} reached`
        : s.activeDays >= 6
          ? "Unstoppable week"
          : top
            ? `A ${top.label} week`
            : "Week in review";

  const p1: string[] = [];
  const diff = s.xp - s.prevWeekXp;
  p1.push(
    `You earned ${s.xp.toLocaleString("en")} XP over ${plural(s.activeDays, "active day")}${s.prevWeekXp > 0 ? `, ${diff >= 0 ? `${diff.toLocaleString("en")} more` : `${(-diff).toLocaleString("en")} less`} than the week before` : ""}.`,
  );
  if (top) p1.push(`${top.label} led the way with ${top.xp.toLocaleString("en")} XP${s.domains[1] ? `, followed by ${s.domains[1].label}` : ""}.`);
  if (s.topActivities[0]) {
    const a = s.topActivities[0];
    p1.push(`Your top activity was ${a.name}: ${plural(a.times, "time")}${a.unit !== "session" ? `, ${a.amount.toLocaleString("en")} ${a.unit}${a.amount === 1 ? "" : "s"} in all` : ""}.`);
  }
  if (s.bestDay) p1.push(`Best day: ${weekdayName(s.bestDay.day)} with ${s.bestDay.xp} XP.`);

  const p2: string[] = [];
  if (s.level.to > s.level.from) p2.push(`You went from level ${s.level.from} to ${s.level.to} overall.`);
  if (ups.length) p2.push(`${list(ups.map((d) => `${d.label} reached level ${d.levelTo}`))}.`);
  const wins = [...s.bossesDefeated.map((b) => `defeated ${b}`), ...s.questsCleared.map((q) => `cleared ${q}`)];
  if (wins.length) p2.push(`You ${list(wins.slice(0, 4))}${wins.length > 4 ? `, and ${wins.length - 4} more` : ""}.`);
  if (s.dailiesDone) p2.push(`${s.dailiesDone} ${s.dailiesDone === 1 ? "daily" : "dailies"} checked off.`);
  if (s.trophies.length) p2.push(`New trophies: ${list(s.trophies)}.`);
  if (s.skills.length) p2.push(`Skills unlocked: ${list(s.skills)}.`);
  p2.push(
    s.streak.atEnd > 0
      ? `The streak stood at ${s.streak.atEnd} days at the end of the week${s.streak.shields ? `, with ${plural(s.streak.shields, "shield")} in reserve` : ""}.`
      : "The streak reset this week, so Monday is a fresh day one.",
  );
  if (s.season)
    p2.push(
      `${s.season.name}: day ${s.season.dayNumber} of ${s.season.totalDays}, rank ${s.season.rank}${s.season.goalsTotal ? `, ${s.season.goalsDone}/${s.season.goalsTotal} goals done` : ""}.`,
    );

  const quiet = gameConfig.domains.filter((d) => !s.domains.some((x) => x.id === d.id)).map((d) => d.label);
  const next = quiet.length ? `Next week: give ${quiet[0]} a little time.` : "Next week: keep every domain moving.";
  return { title, body: `${p1.join(" ")}\n\n${p2.join(" ")}\n\n${next}` };
}

// ---------- AI recap ----------

export const RECAP_SYSTEM_PROMPT = `You write the weekly recap for a personal "Life RPG" website, where someone tracks their real life as a game: XP, levels per life domain, quests, streaks and seasons.

Write in second person ("you"), warm and a little playful, like a narrator in a stylish JRPG menu. Keep it honest and grounded: celebrate real wins, mention a slow area kindly, never guilt-trip.

Use only facts from the data you're given. Don't invent numbers, events or feelings. If diary notes are included, you may refer to what they say in general terms, but don't quote private details word for word.

Format, as plain text with no markdown:
- Line 1: a short headline (2 to 7 words), no quotes and no trailing period.
- Then 2 short paragraphs (120 to 200 words in total): the week's wins and numbers, then streak, momentum and season progress.
- Last line: starts with "Next week:" and gives one concrete, small suggestion.`;

/** The data part of the request. */
export function recapPrompt(s: WeekStats, notes: ReadonlyArray<Pick<DiaryEntry, "day" | "title" | "body" | "mood">>, playerName: string): string {
  const data = {
    player: playerName,
    week: `${s.weekStart} to ${s.weekEnd} (${weekLabel(s.weekStart)})`,
    ...s,
    domains: s.domains.map(({ label, xp, levelFrom, levelTo }) => ({ domain: label, xp, levelFrom, levelTo })),
    allDomains: gameConfig.domains.map((d) => d.label),
  };
  const notesText = notes.length
    ? notes
        .map((n) => `[${n.day}${n.mood ? `, mood ${n.mood}/5` : ""}]${n.title ? ` ${n.title}:` : ""} ${n.body.slice(0, 1500)}`)
        .join("\n")
        .slice(0, 8000)
    : "";
  return `Here is the data for the week. Write the recap.\n\n<week_data>\n${JSON.stringify(data, null, 1)}\n</week_data>${
    notesText ? `\n\n<diary_notes>\n${notesText}\n</diary_notes>` : ""
  }`;
}

/** Splits Claude's reply into a headline and body, and keeps both within the database limits. */
export function parseRecap(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const first = (lines.shift() ?? "").replace(/^#+\s*/, "").replace(/^["“*]+|["”*.]+$/g, "").trim();
  const body = lines.join("\n").trim().replace(/\n{3,}/g, "\n\n");
  if (!first) throw new Error("The recap came back empty. Try again.");
  if (!body) return { title: "Week in review", body: first.slice(0, 6000) };
  return { title: first.slice(0, 120), body: body.slice(0, 6000) };
}
