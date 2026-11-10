// Accent color themes, unlocked by overall level. Each one keeps white text
// on the accent at least as readable as the default crimson.

export interface Theme {
  id: string;
  name: string;
  level: number;
  accent: string;
  deep: string;
}

export const THEMES: Theme[] = [
  { id: "crimson", name: "Crimson", level: 1, accent: "#d31329", deep: "#8f0d1d" },
  { id: "cobalt", name: "Cobalt", level: 5, accent: "#1d4ed8", deep: "#1e3a8a" },
  { id: "jade", name: "Jade", level: 10, accent: "#0b7a45", deep: "#064e2b" },
  { id: "blaze", name: "Blaze", level: 15, accent: "#c2410c", deep: "#7c2d12" },
  { id: "royal", name: "Royal", level: 20, accent: "#7c3aed", deep: "#4c1d95" },
];

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The theme to show: the chosen one if unlocked, otherwise the default. */
export function effectiveTheme(id: string | null | undefined, level: number): Theme {
  const t = getTheme(id);
  return t.level <= level ? t : THEMES[0];
}

export function checkTheme(id: string, level: number): void {
  const t = THEMES.find((x) => x.id === id);
  if (!t) throw new Error("Unknown theme.");
  if (t.level > level) throw new Error(`${t.name} unlocks at level ${t.level}.`);
}

/** CSS variables that recolor everything that uses the accent. */
export function themeStyle(theme: Theme): Record<string, string> {
  return { "--crimson": theme.accent, "--crimson-deep": theme.deep };
}

export function nextThemeUnlock(level: number): Theme | null {
  return THEMES.find((t) => t.level > level) ?? null;
}
