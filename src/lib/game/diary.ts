// Diary: free-form notes, one or more per day. Private unless you unlock one.
import { isDay } from "./streaks";

export interface DiaryEntry {
  id: string;
  /** YYYY-MM-DD */
  day: string;
  title: string | null;
  body: string;
  /** 1 (rough) to 5 (great), or null. */
  mood: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryInput {
  day: string;
  title?: string | null;
  body: string;
  mood?: number | null;
  isPublic?: boolean;
}

export const DIARY_LIMITS = { title: 80, body: 20_000 } as const;

export const MOODS: { value: number; glyph: string; label: string }[] = [
  { value: 1, glyph: "▼▼", label: "Rough" },
  { value: 2, glyph: "▼", label: "Low" },
  { value: 3, glyph: "■", label: "Okay" },
  { value: 4, glyph: "▲", label: "Good" },
  { value: 5, glyph: "▲▲", label: "Great" },
];
export const moodOf = (mood: number | null | undefined) => MOODS.find((m) => m.value === mood) ?? null;

/** Checks and tidies a diary entry. Throws a readable error. */
export function normalizeDiaryInput(input: DiaryInput, today: string): Required<DiaryInput> {
  if (!isDay(input.day)) throw new Error("Pick a valid date.");
  if (input.day > today) throw new Error("Diary entries can't be dated in the future.");
  const title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (title.length > DIARY_LIMITS.title) throw new Error(`Keep the title under ${DIARY_LIMITS.title} characters.`);
  // Keep line breaks, drop trailing spaces and extra blank lines at the ends.
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
  if (!body) throw new Error("Write something first.");
  if (body.length > DIARY_LIMITS.body) throw new Error(`That's over ${DIARY_LIMITS.body.toLocaleString("en")} characters. Split it into two entries.`);
  const mood = input.mood === null || input.mood === undefined ? null : Number(input.mood);
  if (mood !== null && !(Number.isInteger(mood) && mood >= 1 && mood <= 5)) throw new Error("Mood must be 1 to 5.");
  return { day: input.day, title: title || null, body, mood, isPublic: input.isPublic === true };
}

/** Case-insensitive search over titles and text. Every word must appear. */
export function searchDiary(entries: ReadonlyArray<DiaryEntry>, query: string): DiaryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...entries];
  return entries.filter((e) => {
    const text = `${e.title ?? ""}\n${e.body}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Newest first: by day, then by when it was written. */
export const sortDiary = (entries: ReadonlyArray<DiaryEntry>) =>
  [...entries].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));

/** A short preview of the text, cut at a word. */
export function excerpt(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max)}…`;
}

