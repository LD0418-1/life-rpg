"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import * as actions from "@/app/actions";
import type { ActionResult } from "@/app/actions";
import type { SheetBackend, SheetData } from "@/lib/game/types";
import { AppShell } from "./AppShell";
import { GameProvider } from "./GameProvider";

/** Turns an action's { ok, error } result back into a value or a thrown error. */
async function unwrap<T>(promise: Promise<ActionResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** The real game, backed by Supabase through server actions. */
export function LiveGame({ initial, isOwner, children }: { initial: SheetData; isOwner: boolean; children: ReactNode }) {
  const router = useRouter();

  const backend = useMemo<SheetBackend>(
    () => ({
      logActivity: (slug, options) => unwrap(actions.logActivityAction(slug, options)),
      deleteEntry: (entryId) => unwrap(actions.deleteEntryAction(entryId)),
      completeDaily: (questId) => unwrap(actions.completeDailyAction(questId)),
      setObjective: (_questId, objectiveId, done) => unwrap(actions.setObjectiveAction(objectiveId, done)),
      createQuest: (input) => unwrap(actions.createQuestAction(input)),
      updateQuest: (questId, edit) => unwrap(actions.updateQuestAction(questId, edit)),
      addObjective: (questId, title) => unwrap(actions.addObjectiveAction(questId, title)),
      removeObjective: (questId, objectiveId) => unwrap(actions.removeObjectiveAction(questId, objectiveId)),
      abandonQuest: (questId) => unwrap(actions.abandonQuestAction(questId)),
      planRest: (day) => unwrap(actions.planRestAction(day)),
      unplanRest: (day) => unwrap(actions.unplanRestAction(day)),
      createSkill: (input) => unwrap(actions.createSkillAction(input)),
      deleteSkill: (skillId) => unwrap(actions.deleteSkillAction(skillId)),
      unlockSkill: (skillId) => unwrap(actions.unlockSkillAction(skillId)),
      createLoot: (input) => unwrap(actions.createLootAction(input)),
      archiveLoot: (itemId) => unwrap(actions.archiveLootAction(itemId)),
      buyLoot: (itemId) => unwrap(actions.buyLootAction(itemId)),
      redeemPurchase: (purchaseId) => unwrap(actions.redeemPurchaseAction(purchaseId)),
      syncAchievements: () => unwrap(actions.syncAchievementsAction()),
    }),
    [],
  );

  // First visit as owner: save your time zone so "today" is your today.
  useEffect(() => {
    if (!isOwner) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && browserZone !== initial.timezone) {
      actions.setTimezoneAction(browserZone).then((r) => r.ok && router.refresh());
    }
  }, [isOwner, initial.timezone, router]);

  return (
    <GameProvider
      // Start fresh when the day or time zone changes.
      key={`${initial.today}-${initial.timezone}`}
      initial={initial}
      backend={backend}
      mode={isOwner ? "owner" : "visitor"}
      basePath=""
    >
      <AppShell
        accountActions={
          isOwner ? (
            <form action={actions.signOutAction}>
              <button className="font-label font-extrabold tracking-widest uppercase hover:text-paper">Log out</button>
            </form>
          ) : (
            <Link href="/login" className="hover:text-paper">Owner login</Link>
          )
        }
      >
        {children}
      </AppShell>
    </GameProvider>
  );
}
