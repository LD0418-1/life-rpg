// Streaks, shields, rest days and momentum.
//
// Nothing here is stored: everything is replayed from your daily XP and your
// planned rest days, from the first active day up to today. That means it can
// never drift out of sync, and changing xp.json re-tells your history with the
// new rules.
import { type GameConfig, gameConfig } from "./config";

export interface DayXp {
  day: string; // YYYY-MM-DD
  xp: number;
}

export type DayStatus =
  | "active" // logged enough XP
  | "rest" // planned rest day: streak safe
  | "shielded" // missed, but a shield saved the streak
  | "missed" // missed, streak reset
  | "pending" // today, nothing logged yet
  | "planned-rest"; // a rest day in the future

export interface Progress {
  streak: number;
  bestStreak: number;
  shields: number;
  /** 0-100, including today's activity. */
  momentum: number;
  /** Momentum before today: this is what boosts today's XP. */
  momentumAtDayStart: number;
  /** XP multiplier for activities logged today, e.g. 1.12. */
  xpMultiplier: number;
  todayStatus: "active" | "rest" | "pending";
  /** What happens if today ends with nothing logged. */
  ifMissedToday: "nothing" | "shield" | "break";
  restLeftThisWeek: number;
  statuses: Record<string, DayStatus>;
}

// ---------- Day helpers (all in plain YYYY-MM-DD, no time zones) ----------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday that starts this day's week (weeks run Monday to Sunday). */
export function weekStart(day: string): string {
  return addDays(day, -weekday(day));
}

// ---------- The replay ----------

export function computeProgress(
  days: ReadonlyArray<DayXp>,
  restDays: ReadonlyArray<string>,
  today: string,
  config: GameConfig = gameConfig,
): Progress {
  const { minXpPerDay, shieldEvery, maxShields, restDaysPerWeek } = config.streak;
  const { gainPerActiveDay, missDecay, maxXpBonus } = config.momentum;

  const xpByDay = new Map<string, number>();
  for (const d of days) xpByDay.set(d.day, (xpByDay.get(d.day) ?? 0) + d.xp);
  const isActive = (day: string) => (xpByDay.get(day) ?? 0) >= minXpPerDay;
  const rest = new Set(restDays);

  let streak = 0;
  let bestStreak = 0;
  let shields = 0;
  let momentum = 0;
  let momentumAtDayStart = 0;
  const statuses: Record<string, DayStatus> = {};

  const activeDays = [...xpByDay.keys()].filter((d) => d <= today && isActive(d)).sort();
  if (activeDays.length) {
    for (let day = activeDays[0]; day <= today; day = addDays(day, 1)) {
      if (day === today) momentumAtDayStart = momentum;
      if (isActive(day)) {
        streak++;
        momentum = Math.min(100, momentum + gainPerActiveDay);
        if (streak % shieldEvery === 0 && shields < maxShields) shields++;
        statuses[day] = "active";
      } else if (rest.has(day)) {
        statuses[day] = "rest";
      } else if (day === today) {
        statuses[day] = "pending"; // the day isn't over yet
      } else if (shields > 0) {
        shields--;
        momentum *= 1 - missDecay;
        statuses[day] = "shielded";
      } else {
        streak = 0;
        momentum *= 1 - missDecay;
        statuses[day] = "missed";
      }
      bestStreak = Math.max(bestStreak, streak);
    }
  }

  for (const r of rest) {
    if (r > today) statuses[r] = "planned-rest";
    else if (!statuses[r] && r === today) statuses[r] = "rest";
  }

  const todayStatus = isActive(today) ? "active" : rest.has(today) ? "rest" : "pending";
  const ifMissedToday = todayStatus !== "pending" || streak === 0 ? "nothing" : shields > 0 ? "shield" : "break";
  const monday = weekStart(today);
  const restThisWeek = [...rest].filter((r) => weekStart(r) === monday).length;

  return {
    streak,
    bestStreak,
    shields,
    momentum: Math.round(momentum * 10) / 10,
    momentumAtDayStart: Math.round(momentumAtDayStart * 10) / 10,
    xpMultiplier: 1 + (maxXpBonus * momentumAtDayStart) / 100,
    todayStatus,
    ifMissedToday,
    restLeftThisWeek: Math.max(0, restDaysPerWeek - restThisWeek),
    statuses,
  };
}

// ---------- Rest day rules ----------

/** Throws a readable error if `day` can't be planned as a rest day. */
export function checkPlanRest(
  day: string,
  today: string,
  restDays: ReadonlyArray<string>,
  xpOnDay: number,
  config: GameConfig = gameConfig,
): void {
  const { restDaysPerWeek, planAheadDays, minXpPerDay } = config.streak;
  if (!isDay(day)) throw new Error("That's not a valid date.");
  if (day < today) throw new Error("Rest days have to be planned for today or later, not after the fact.");
  if (day > addDays(today, planAheadDays)) throw new Error(`You can plan up to ${planAheadDays} days ahead.`);
  if (restDays.includes(day)) throw new Error("That's already a rest day.");
  if (day === today && xpOnDay >= minXpPerDay) throw new Error("You've already been active today, so it counts. No rest day needed.");
  const monday = weekStart(day);
  const inWeek = restDays.filter((r) => weekStart(r) === monday).length;
  if (inWeek >= restDaysPerWeek)
    throw new Error(
      restDaysPerWeek === 0
        ? "Rest days are turned off in xp.json."
        : `You can plan ${restDaysPerWeek} rest day${restDaysPerWeek === 1 ? "" : "s"} per week (Monday to Sunday).`,
    );
}

export function checkUnplanRest(day: string, today: string, restDays: ReadonlyArray<string>): void {
  if (!isDay(day)) throw new Error("That's not a valid date.");
  if (day < today) throw new Error("Past rest days stay in your history.");
  if (!restDays.includes(day)) throw new Error("That isn't a rest day.");
}
