import { gameConfig } from "./config";
import type { SheetData } from "./types";

export const domainLabel = (id: string) => gameConfig.domains.find((d) => d.id === id)?.label ?? id;
export const domainGlyph = (id: string) => gameConfig.domains.find((d) => d.id === id)?.glyph ?? "???";
export const unitLabel = (n: number, unit = "") => `${n} ${unit}${n === 1 ? "" : "s"}`;
export const activityOf = (slug: string | null | undefined) => gameConfig.activities.find((a) => a.slug === slug);

/** Adds `xp` to `day` in a list of daily totals (drops days that reach 0). */
export function addDayXp(days: SheetData["days"], day: string, xp: number): SheetData["days"] {
  const found = days.some((d) => d.day === day);
  const next = found ? days.map((d) => (d.day === day ? { ...d, xp: d.xp + xp } : d)) : [...days, { day, xp }];
  return next.filter((d) => d.xp > 0);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
