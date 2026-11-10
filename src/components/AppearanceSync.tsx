"use client";

import { useEffect } from "react";
import { applyAppearance, getAppearance } from "@/lib/prefs";

/** Keeps the phone's status-bar color in step with the theme (also when "auto" follows the device). */
export function AppearanceSync() {
  useEffect(() => {
    applyAppearance(getAppearance());
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyAppearance(getAppearance());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return null;
}
