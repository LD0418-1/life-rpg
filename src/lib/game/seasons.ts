// Seasons: chapters of your life with a name, dates and goals (quests pinned
// to them). Stats are calculated from your daily XP, nothing extra is stored.
import { gameConfig } from "./config";
import { cleanTitle } from "./quests";
import { type DayXp, addDays, isDay } from "./streaks";
import { levelFromXp } from "./xp";

export interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  notes: string | null;
}

/** A quest pinned to a season, as far as the season recap needs to know. */
export interface SeasonGoal {
  id: string;
  title: string;
  seasonId: string;
  status: "active" | "completed" | "abandoned";
}

export interface NewSeasonInput {
  name: string;
  startsOn: string;
  endsOn: string;
  notes: string;
  questIds: string[];
}

export interface SeasonEdit {
  name: string;
  endsOn: string;
  notes: string;
}

export type Rank = "S" | "A" | "B" | "C" | "D";

export const MAX_SEASON_DAYS = 366;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const overlaps = (a: { startsOn: string; endsOn: string }, b: { startsOn: string; endsOn: string }) =>
  a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;

export function seasonState(s: Season, today: string): "upcoming" | "current" | "past" {
  return today < s.startsOn ? "upcoming" : today > s.endsOn ? "past" : "current";
}

export function currentSeason(seasons: ReadonlyArray<Season>, today: string): Season | null {
  return seasons.find((s) => seasonState(s, today) === "current") ?? null;
}

/** A sensible default: start today, end on the last day of this quarter (or the next one if this quarter is nearly over). */
export function suggestSeason(today: string): { name: string; startsOn: string; endsOn: string } {
  const [y, m] = today.split("-").map(Number);
  let quarter = Math.floor((m - 1) / 3); // 0-3
  let year = y;
  const quarterEnd = (q: number, yr: number) => addDays(`${q === 3 ? yr + 1 : yr}-${String(q === 3 ? 1 : q * 3 + 4).padStart(2, "0")}-01`, -1);
  let end = quarterEnd(quarter, year);
  if (daysBetween(today, end) < 30) {
    quarter = (quarter + 1) % 4;
    if (quarter === 0) year++;
    end = quarterEnd(quarter, year);
  }
  return { name: `Q${quarter + 1} ${year}`, startsOn: today, endsOn: end };
}

function checkDates(startsOn: string, endsOn: string) {
  if (!isDay(startsOn) || !isDay(endsOn)) throw new Error("Pick valid start and end dates.");
  if (endsOn < startsOn) throw new Error("A season can't end before it starts.");
  if (daysBetween(startsOn, endsOn) + 1 > MAX_SEASON_DAYS) throw new Error(`Keep seasons to ${MAX_SEASON_DAYS} days or less.`);
}

function cleanSeasonName(raw: string) {
  const name = cleanTitle(raw, "season");
  if (name.length > 60) throw new Error("Keep season names under 60 characters.");
  return name;
}

export function normalizeNewSeason(input: NewSeasonInput, existing: ReadonlyArray<Season>, today: string) {
  const name = cleanSeasonName(input.name);
  checkDates(input.startsOn, input.endsOn);
  if (input.endsOn < today) throw new Error("A new season has to end today or later.");
  const clash = existing.find((s) => overlaps(s, input));
  if (clash) throw new Error(`Those dates overlap "${clash.name}" (${clash.startsOn} to ${clash.endsOn}).`);
  return { name, startsOn: input.startsOn, endsOn: input.endsOn, notes: input.notes.trim().slice(0, 500) || null, questIds: [...new Set(input.questIds)] };
}

export function normalizeSeasonEdit(season: Season, edit: SeasonEdit, existing: ReadonlyArray<Season>, today: string) {
  const name = cleanSeasonName(edit.name);
  const notes = edit.notes.trim().slice(0, 500) || null;
  if (edit.endsOn !== season.endsOn) {
    if (seasonState(season, today) === "past") throw new Error("Past seasons are history: you can rename them, not move them.");
    checkDates(season.startsOn, edit.endsOn);
    if (edit.endsOn < today) throw new Error("The end date can't be in the past. Use today to end it now.");
    const clash = existing.find((s) => s.id !== season.id && overlaps(s, { startsOn: season.startsOn, endsOn: edit.endsOn }));
    if (clash) throw new Error(`That end date overlaps "${clash.name}".`);
  }
  return { name, notes, endsOn: edit.endsOn };
}

export function rankFor(activeDays: number, elapsedDays: number): Rank {
  if (elapsedDays <= 0) return "D";
  const r = activeDays / elapsedDays;
  return r >= 0.9 ? "S" : r >= 0.75 ? "A" : r >= 0.5 ? "B" : r >= 0.25 ? "C" : "D";
}

export interface SeasonStats {
  state: "upcoming" | "current" | "past";
  totalDays: number;
  /** Days of the season that have happened (including today). */
  elapsedDays: number;
  dayNumber: number;
  xp: number;
  activeDays: number;
  bestStreak: number;
  questsCompleted: number;
  goalsDone: number;
  goalsTotal: number;
  levelAtStart: number;
  levelNow: number;
  rank: Rank;
}

export function seasonStats(
  season: Season,
  days: ReadonlyArray<DayXp>,
  today: string,
  completedOn: ReadonlyArray<string>,
  goals: ReadonlyArray<{ done: boolean }>,
): SeasonStats {
  const state = seasonState(season, today);
  const totalDays = daysBetween(season.startsOn, season.endsOn) + 1;
  const lastDay = state === "past" ? season.endsOn : today;
  const elapsedDays = state === "upcoming" ? 0 : daysBetween(season.startsOn, lastDay) + 1;
  const { minXpPerDay } = gameConfig.streak;

  const xpByDay = new Map<string, number>();
  for (const d of days) xpByDay.set(d.day, (xpByDay.get(d.day) ?? 0) + d.xp);
  let xp = 0;
  let before = 0;
  let activeDays = 0;
  let run = 0;
  let bestStreak = 0;
  for (const [day, dayXp] of xpByDay) if (day < season.startsOn) before += dayXp;
  for (let i = 0; i < elapsedDays; i++) {
    const day = addDays(season.startsOn, i);
    const dayXp = xpByDay.get(day) ?? 0;
    xp += dayXp;
    if (dayXp >= minXpPerDay) {
      activeDays++;
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else if (day !== today) run = 0;
  }
  const curve = gameConfig.levels.overall;
  // Today isn't over, so a quiet today doesn't drag the rank down.
  const judgedDays = state === "current" && (xpByDay.get(today) ?? 0) < minXpPerDay ? elapsedDays - 1 : elapsedDays;

  return {
    state,
    totalDays,
    elapsedDays,
    dayNumber: Math.min(totalDays, Math.max(0, elapsedDays)),
    xp,
    activeDays,
    bestStreak,
    questsCompleted: completedOn.filter((d) => d >= season.startsOn && d <= lastDay).length,
    goalsDone: goals.filter((g) => g.done).length,
    goalsTotal: goals.length,
    levelAtStart: levelFromXp(before, curve).level,
    levelNow: levelFromXp(before + xp, curve).level,
    rank: rankFor(activeDays, Math.max(0, judgedDays)),
  };
}
