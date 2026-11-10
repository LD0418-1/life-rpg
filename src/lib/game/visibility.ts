// What visitors may see on your public page. Stored in profile.visibility and
// enforced by the database rules in 0007_showcase_privacy.sql.

export const SECTIONS = ["quests", "journal", "streak", "world", "skills", "trophies", "seasons"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_INFO: Record<Section, { label: string; hint: string }> = {
  quests: { label: "Quests", hint: "Your active quests and their objectives." },
  journal: { label: "Journal", hint: "The timeline of what you did. (Entries still count toward your public stats; lock single entries to keep them private.)" },
  streak: { label: "Streak", hint: "Streak, shields, momentum and rest days." },
  world: { label: "World map", hint: "Your island and its buildings." },
  skills: { label: "Skills", hint: "Skill trees and what you've unlocked." },
  trophies: { label: "Trophies", hint: "Achievements you've earned." },
  seasons: { label: "Seasons", hint: "Current season, goals and past recaps." },
};

export interface Visibility {
  sections: Record<Section, boolean>;
  /** Domains whose entries, quests and skills visitors never see. */
  hiddenDomains: string[];
}

export const DEFAULT_VISIBILITY: Visibility = {
  sections: Object.fromEntries(SECTIONS.map((s) => [s, true])) as Record<Section, boolean>,
  hiddenDomains: [],
};

/** Reads profile.visibility (missing keys mean "shown"). */
export function parseVisibility(raw: unknown): Visibility {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sections = { ...DEFAULT_VISIBILITY.sections };
  for (const s of SECTIONS) if (typeof obj[s] === "boolean") sections[s] = obj[s] as boolean;
  const hiddenDomains = Array.isArray(obj.hiddenDomains) ? obj.hiddenDomains.filter((d): d is string => typeof d === "string") : [];
  return { sections, hiddenDomains };
}

/** The JSON stored in the database. */
export function visibilityJson(v: Visibility): Record<string, unknown> {
  return { ...v.sections, hiddenDomains: [...new Set(v.hiddenDomains)] };
}
