"use client";

// Per-device preferences: light / dark theme and sound on / off. Kept in this
// browser only (localStorage), so each device (and each visitor) chooses for itself.
import { useSyncExternalStore } from "react";
import { APPEARANCE_KEY } from "./appearance-script";

export type Appearance = "dark" | "light" | "auto";

const SOUND_KEY = "lrpg-sound";
const EVENT = "lrpg-prefs";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode / blocked storage: use the defaults
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not saved, but still applied for this visit
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getAppearance(): Appearance {
  const a = read(APPEARANCE_KEY);
  return a === "light" || a === "auto" ? a : "dark";
}

/** Applies the theme to the page (and the phone's status bar color). */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a === "dark") delete root.dataset.theme;
  else root.dataset.theme = a;
  const light = a === "light" || (a === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#efeae0" : "#0b0b0d");
}

export function setAppearance(a: Appearance) {
  write(APPEARANCE_KEY, a);
  applyAppearance(a);
}

/** Sound is on unless you turned it off. */
export const soundEnabled = () => read(SOUND_KEY) !== "off";
export const setSoundEnabled = (on: boolean) => write(SOUND_KEY, on ? "on" : "off");

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** The current preferences, updating live. The server render assumes the defaults. */
export function usePrefs(): { appearance: Appearance; sound: boolean } {
  const appearance = useSyncExternalStore(subscribe, getAppearance, () => "dark" as const);
  const sound = useSyncExternalStore(subscribe, soundEnabled, () => true);
  return { appearance, sound };
}
