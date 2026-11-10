"use client";

import { useState } from "react";

/** Shares a card image with the phone's share sheet, or downloads it where sharing files isn't supported. */
export function ShareButton({
  href,
  filename,
  title,
  label = "Share",
  className = "",
}: {
  href: string;
  filename: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("busy");
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("card failed");
      const file = new File([await res.blob()], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setState("done");
    } catch (err) {
      // Closing the share sheet counts as "AbortError": not a failure.
      setState(err instanceof DOMException && err.name === "AbortError" ? "idle" : "error");
    }
  };
  return (
    <button
      type="button"
      onClick={share}
      disabled={state === "busy"}
      className={`skew-box bg-paper px-5 py-1.5 font-label text-base font-extrabold tracking-wider text-ink uppercase hover:bg-volt disabled:opacity-60 ${className}`}
    >
      {state === "busy" ? "Making card…" : state === "done" ? "Shared ✓" : state === "error" ? "Couldn't share" : `${label} ↗`}
    </button>
  );
}
