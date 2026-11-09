"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  type ActionResult,
  abandonQuestAction,
  completeDailyAction,
  createQuestAction,
  logActivityAction,
  setObjectiveAction,
  setTimezoneAction,
  signOutAction,
} from "@/app/actions";
import type { SheetBackend, SheetData } from "@/lib/game/types";
import { CharacterSheet } from "./CharacterSheet";

/** Turns an action's { ok, error } result back into a value or a thrown error. */
async function unwrap<T>(promise: Promise<ActionResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** The real character sheet, backed by Supabase through server actions. */
export function LiveSheet({ initial, isOwner }: { initial: SheetData; isOwner: boolean }) {
  const router = useRouter();

  const backend = useMemo<SheetBackend>(
    () => ({
      logActivity: (slug, difficulty) => unwrap(logActivityAction(slug, difficulty)),
      completeDaily: (questId) => unwrap(completeDailyAction(questId)),
      setObjective: (_questId, objectiveId, done) => unwrap(setObjectiveAction(objectiveId, done)),
      createQuest: (input) => unwrap(createQuestAction(input)),
      abandonQuest: (questId) => unwrap(abandonQuestAction(questId)),
    }),
    [],
  );

  // First visit as owner: save your time zone so "today" is your today.
  useEffect(() => {
    if (!isOwner) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && browserZone !== initial.timezone) {
      setTimezoneAction(browserZone).then((r) => r.ok && router.refresh());
    }
  }, [isOwner, initial.timezone, router]);

  return (
    <CharacterSheet
      // Remount when the server sends fresh data (e.g. after a refresh).
      key={`${initial.today}-${initial.timezone}`}
      initial={initial}
      backend={backend}
      mode={isOwner ? "owner" : "visitor"}
      footer={
        isOwner ? (
          <form action={signOutAction}>
            <button className="font-label font-extrabold tracking-widest uppercase hover:text-paper">Log out</button>
          </form>
        ) : (
          <Link href="/login" className="font-label font-extrabold tracking-widest uppercase hover:text-paper">
            Owner login
          </Link>
        )
      }
    />
  );
}
