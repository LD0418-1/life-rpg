import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LiveGame } from "@/components/game/LiveGame";
import { loadSheet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Visitor view · Life RPG", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Your public page exactly as a logged-out visitor sees it (loaded with no login at all). */
export default async function ShowcasePreviewLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/preview/showcase");
  const result = await loadSheet({ asVisitor: true });
  if (result.kind === "sheet") {
    return (
      <LiveGame initial={result.sheet} isOwner={false} asVisitor basePath="/showcase">
        {children}
      </LiveGame>
    );
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="font-label text-base font-semibold tracking-[0.3em] text-crimson-text uppercase">Visitor view</p>
        <h1 className="mt-2 -rotate-2 font-display text-6xl uppercase">Coming <span className="bg-paper px-2 text-ink">soon</span></h1>
        <p className="mt-6 text-muted">
          That&apos;s all visitors see right now, because your profile is private. Turn on <strong>Public profile</strong> in Settings to show your page.
        </p>
        <div className="mt-8 flex justify-center gap-5 font-label font-extrabold tracking-widest uppercase">
          <Link href="/settings" className="text-paper hover:text-volt">Settings</Link>
          <Link href="/" className="text-muted hover:text-paper">Back to your sheet</Link>
        </div>
      </div>
    </main>
  );
}
