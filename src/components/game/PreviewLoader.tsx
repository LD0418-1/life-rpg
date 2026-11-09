"use client";

import dynamic from "next/dynamic";

// The preview builds sample data from today's date in your browser's time zone,
// so it renders only in the browser (avoids server/browser date mismatches).
const PreviewSheet = dynamic(() => import("./PreviewSheet"), {
  ssr: false,
  loading: () => <div className="grid min-h-dvh place-items-center font-display text-4xl text-crimson uppercase">Loading…</div>,
});

export function PreviewLoader() {
  return <PreviewSheet />;
}
