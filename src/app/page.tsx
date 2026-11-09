import Link from "next/link";
import { LiveSheet } from "@/components/game/LiveSheet";
import { PreviewLoader } from "@/components/game/PreviewLoader";
import { loadSheet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Always render fresh: the page depends on who's logged in and today's data.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <PreviewLoader />;

  const result = await loadSheet();
  if (result.kind === "sheet") return <LiveSheet initial={result.sheet} isOwner={result.isOwner} />;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="font-label text-base font-semibold tracking-[0.3em] text-crimson uppercase">Life RPG</p>
        <h1 className="mt-2 -rotate-2 font-display text-6xl uppercase sm:text-8xl">
          Coming <span className="bg-paper px-2 text-ink">soon</span>
        </h1>
        <p className="mt-6 text-muted">
          {result.signedIn ? "You're signed in, but you're not the owner of this site." : "This adventure isn't public yet."}
        </p>
        <Link href="/login" className="mt-8 inline-block font-label font-extrabold tracking-widest text-muted uppercase hover:text-paper">
          Owner login
        </Link>
      </div>
    </main>
  );
}
