"use client";

import { useEffect } from "react";

/** Registers public/sw.js (production only, so local development never serves stale files). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not critical: the site works without it, just not offline.
    });
  }, []);
  return null;
}
