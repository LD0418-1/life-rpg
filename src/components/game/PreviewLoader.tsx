"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The preview builds sample data from today's date in your browser's time zone,
// so it renders only in the browser (avoids server/browser date mismatches).
const PreviewGame = dynamic(() => import("./PreviewGame"), {
  ssr: false,
  loading: () => <div className="grid min-h-dvh place-items-center font-display text-4xl text-crimson-text uppercase">Loading…</div>,
});

export function PreviewLoader({ children }: { children: ReactNode }) {
  return <PreviewGame>{children}</PreviewGame>;
}
