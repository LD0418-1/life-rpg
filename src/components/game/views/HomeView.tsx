"use client";

import { useGame } from "../GameProvider";
import { ShowcaseView } from "./ShowcaseView";
import { TodayView } from "./TodayView";

/** The home page: your Today page for you, your public showcase for visitors. */
export function HomeView() {
  const { mode } = useGame();
  return mode === "visitor" ? <ShowcaseView /> : <TodayView />;
}
