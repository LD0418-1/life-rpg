// Colors you can give a linked calendar. Each stays readable on the dark panels.
export const FEED_COLORS = ["crimson", "volt", "paper", "cobalt", "jade", "blaze"] as const;
export type FeedColor = (typeof FEED_COLORS)[number];

export const FEED_COLOR_VALUE: Record<FeedColor, string> = {
  crimson: "var(--crimson)",
  volt: "var(--volt)",
  paper: "var(--paper)",
  cobalt: "#3b82f6",
  jade: "#16a34a",
  blaze: "#ea580c",
};

export function feedColor(name: string): string {
  return FEED_COLOR_VALUE[(FEED_COLORS as readonly string[]).includes(name) ? (name as FeedColor) : "crimson"];
}
