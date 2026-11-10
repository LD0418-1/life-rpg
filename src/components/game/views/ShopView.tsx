"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { shortDate } from "@/lib/game/format";
import { type Purchase, buyBlocker } from "@/lib/game/loot";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

function NewRewardForm() {
  const { createLoot } = useGame();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState(50);
  const [repeatable, setRepeatable] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!open) return <SlashButton onClick={() => setOpen(true)} className="w-full">+ Add a reward</SlashButton>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await createLoot({ name, description, cost, repeatable });
    setSaving(false);
    if (ok) {
      setName("");
      setDescription("");
      setOpen(false);
    }
  };

  return (
    <Panel title="New reward">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label htmlFor="loot-name" className={labelClass}>Reward</label>
            <input id="loot-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fancy coffee" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="loot-cost" className={labelClass}>Gold</label>
            <input id="loot-cost" type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(Number(e.target.value))} className={fieldClass} />
          </div>
        </div>
        <div>
          <label htmlFor="loot-desc" className={labelClass}>Note · optional</label>
          <input id="loot-desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="From the good place on the corner" className={fieldClass} />
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={repeatable} onChange={(e) => setRepeatable(e.target.checked)} className="h-4 w-4 accent-[var(--crimson)]" />
          <span>
            Can be bought again <span className="text-sm text-muted">· untick for one-time rewards, like a big purchase</span>
          </span>
        </label>
        <p className="text-xs text-muted">Rough guide: a normal day earns 10–30 gold. Price small treats at a few days, big ones at weeks.</p>
        <div className="flex gap-3">
          <SlashButton type="submit" disabled={saving}>{saving ? "Saving…" : "Add to shop"}</SlashButton>
          <SlashButton type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</SlashButton>
        </div>
      </form>
    </Panel>
  );
}

/** One unused item: "Use it", optionally logging what it cost in the wallet. */
function InventoryRow({ purchase: p, name }: { purchase: Purchase; name: string }) {
  const { data, redeemPurchase, isBusy, basePath } = useGame();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const fromQuest = p.source === "quest";
  const finish = async (withSpend: boolean) => {
    const value = Number(amount);
    const ok = await redeemPurchase(p, withSpend && amount && value > 0 ? { amount: value, category: "Rewards" } : undefined);
    if (ok) setOpen(false);
  };
  return (
    <li className="py-1">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          {name}{" "}
          <span className={`font-label text-[11px] font-extrabold tracking-widest uppercase ${fromQuest ? "text-volt" : "text-muted"}`}>
            {fromQuest ? "◈ Quest reward" : `Bought ${shortDate(p.purchasedAt)}`}
          </span>
        </span>
        {!open && (
          <SlashButton variant="ghost" onClick={() => setOpen(true)} disabled={isBusy(`purchase:${p.id}`)}>
            Use it
          </SlashButton>
        )}
      </div>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void finish(true);
          }}
          className="mt-2 flex flex-wrap items-end gap-2 border-l-2 border-crimson pl-3"
        >
          {data.extrasReady ? (
            <label className="min-w-0 flex-1">
              <span className={labelClass}>Spent money on it? · optional</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 45"
                className={fieldClass}
              />
            </label>
          ) : (
            <span className="flex-1 text-sm text-muted">Enjoy it!</span>
          )}
          <SlashButton type="submit" disabled={isBusy(`purchase:${p.id}`)}>
            {amount && Number(amount) > 0 ? "Use + log spend" : "Use it"}
          </SlashButton>
          <SlashButton type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </SlashButton>
          {data.extrasReady && <p className="w-full text-xs text-muted">Logged spends show up in your <a href={`${basePath}/wallet`} className="underline">Wallet</a> under Rewards.</p>}
        </form>
      )}
    </li>
  );
}

export function ShopView() {
  const { data, canEdit, goldBalance, buyLoot, archiveLoot, isBusy } = useGame();
  if (!canEdit || !data.shop) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-8">
        <PageHeader kicker="Loot" title="Shop" />
        <p className="text-muted">The shop is private.</p>
      </main>
    );
  }
  const { items, purchases } = data.shop;
  const names = new Map(items.map((i) => [i.id, i.name]));
  const unused = purchases.filter((p) => !p.redeemedAt);
  const used = purchases.filter((p) => p.redeemedAt).slice(0, 8);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Spend your gold" title="Loot shop">
        <div className="skew-box bg-ink-3 px-5 py-1 font-display text-3xl">
          <span className="text-volt">◆ {goldBalance.toLocaleString()}</span>
        </div>
      </PageHeader>
      {!data.depthReady && (
        <p className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">
          Buying needs a one-time database update: run <code>supabase/migrations/0004_depth.sql</code> in the Supabase SQL Editor.
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Rewards" kicker="Real treats, real gold">
          {items.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing in the shop yet. Add rewards you actually want (a fancy coffee, a movie night, new headphones) and price them in gold.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const blocker = buyBlocker(item, goldBalance, purchases);
                const short = Math.max(0, item.cost - goldBalance);
                return (
                  <li key={item.id} className="slash-panel flex flex-col bg-ink-3 p-4">
                    <div className="flex items-start gap-2">
                      <h3 className="flex-1 font-display text-xl leading-tight uppercase">{item.name}</h3>
                      <button onClick={() => archiveLoot(item)} aria-label={`Remove ${item.name} from the shop`} className="px-1 text-muted hover:text-crimson">
                        ×
                      </button>
                    </div>
                    {item.description && <p className="text-sm text-muted">{item.description}</p>}
                    <p className="mt-1 font-label text-xs font-extrabold tracking-widest text-muted uppercase">{item.repeatable ? "Repeatable" : "One time"}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="font-display text-2xl text-volt">◆ {item.cost.toLocaleString()}</span>
                      <SlashButton onClick={() => buyLoot(item)} disabled={Boolean(blocker) || isBusy(`loot:${item.id}`)} title={blocker ?? undefined}>
                        {blocker && short > 0 ? `${short} short` : blocker ? "Owned" : "Buy"}
                      </SlashButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <div className="space-y-10">
          <NewRewardForm />
          <Panel title="Inventory" kicker="Bought, not used yet">
            {unused.length === 0 ? (
              <p className="text-sm text-muted">Nothing waiting. Buy something you&apos;ve earned!</p>
            ) : (
              <ul className="divide-y divide-ink-3">
                {unused.map((p) => (
                  <InventoryRow key={p.id} purchase={p} name={p.name ?? names.get(p.itemId ?? "") ?? "Reward"} />
                ))}
              </ul>
            )}
            {used.length > 0 && (
              <>
                <p className="mt-5 mb-2 font-label text-xs font-extrabold tracking-widest text-muted uppercase">Enjoyed</p>
                <ul className="space-y-1 text-sm text-muted">
                  {used.map((p) => (
                    <li key={p.id}>
                      {p.name ?? names.get(p.itemId ?? "") ?? "A retired reward"} · {shortDate(p.redeemedAt!)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      </div>
    </main>
  );
}
