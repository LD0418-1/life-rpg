"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { XpBar } from "@/components/ui/XpBar";
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  type FinanceSettings,
  INCOME_CATEGORIES,
  type MoneyTx,
  type TxKind,
  formatMoney,
  monthLabel,
  monthOf,
  shiftMonth,
  summarizeMonth,
} from "@/lib/game/finance";
import { useGame } from "../GameProvider";
import { PageHeader } from "./PageHeader";

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson [color-scheme:dark]";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function StatTile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="slash-panel bg-ink-2 p-4">
      <div className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">{label}</div>
      <div className="font-display text-3xl leading-tight break-words tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {children}
    </div>
  );
}

/** Spending by category: one hue, sorted biggest first, every row labeled with its amount. */
function CategoryBars({ rows, total, currency }: { rows: { category: string; amount: number }[]; total: number; currency: string }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.category} className="grid grid-cols-[5.5rem_minmax(0,1fr)_8.5rem] items-center gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_10rem]" title={`${r.category}: ${formatMoney(r.amount, currency)}`}>
          <span className="truncate font-label text-sm font-extrabold tracking-wider uppercase">{r.category}</span>
          <span className="h-4 bg-ink-3">
            <span className="block h-full rounded-r-[4px] bg-crimson" style={{ width: `${(r.amount / max) * 100}%` }} />
          </span>
          <span className="text-right text-sm tabular-nums">
            {formatMoney(r.amount, currency)} <span className="text-muted">· {Math.round((r.amount / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Spending per day of the month, with a hover/tap readout. */
function DailyBars({ days, currency, today }: { days: { day: string; amount: number }[]; currency: string; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.amount), 1);
  const W = 620;
  const H = 150;
  const gap = 2;
  const bw = W / days.length - gap;
  const shown = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <div className="mb-2 h-5 text-sm">
        {shown ? (
          <>
            <span className="font-label font-extrabold tracking-wider uppercase">{dayLabel(shown.day)}</span> · {formatMoney(shown.amount, currency)}
          </>
        ) : (
          <span className="text-muted">Hover or tap a bar. Tallest day: {formatMoney(max === 1 && days.every((d) => d.amount === 0) ? 0 : max, currency)}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Spending per day this month" onMouseLeave={() => setHover(null)}>
        <line x1={0} y1={H} x2={W} y2={H} stroke="var(--ink-3)" strokeWidth={1} />
        {days.map((d, i) => {
          const h = d.amount > 0 ? Math.max(3, (d.amount / max) * (H - 6)) : 0;
          const x = i * (bw + gap);
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  d={`M${x} ${H} V${H - h + 4} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V${H}z`}
                  fill={hover === i ? "var(--paper)" : "var(--crimson)"}
                />
              )}
              {d.day === today && <rect x={x} y={H + 4} width={bw} height={3} fill="var(--volt)" />}
              <rect
                x={x - gap / 2}
                y={0}
                width={bw + gap}
                height={H + 18}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${dayLabel(d.day)}: ${formatMoney(d.amount, currency)}`}
              />
            </g>
          );
        })}
        <text x={0} y={H + 16} fontSize={11} fill="var(--muted)">
          1
        </text>
        <text x={W} y={H + 16} fontSize={11} fill="var(--muted)" textAnchor="end">
          {days.length}
        </text>
      </svg>
    </div>
  );
}

function AddEntry({ today, onAdded }: { today: string; onAdded: (tx: MoneyTx) => void }) {
  const { backend } = useGame();
  const [kind, setKind] = useState<TxKind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [custom, setCustom] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presets = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tx = await backend.addTx({ kind, amount: Number(amount), category: custom.trim() || category, occurredOn: day, note });
      onAdded(tx);
      setAmount("");
      setNote("");
      setCustom("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Add entry">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setCategory((k === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0]);
              }}
              className={`skew-box flex-1 px-4 py-1.5 font-label font-extrabold tracking-wider uppercase ${kind === k ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
            >
              {k === "expense" ? "− Spent" : "+ Earned"}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="tx-amount" className={labelClass}>Amount</label>
          <input id="tx-amount" required type="number" inputMode="decimal" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldClass} font-display text-3xl`} placeholder="0.00" />
        </div>
        <div>
          <span className={labelClass}>Category</span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={!custom && category === c}
                onClick={() => {
                  setCategory(c);
                  setCustom("");
                }}
                className={`skew-box px-3 py-0.5 font-label text-sm font-extrabold tracking-wider uppercase ${!custom && category === c ? "bg-crimson text-paper" : "bg-ink-3 text-muted hover:text-paper"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <input aria-label="Or type a category" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="…or type your own" className={`${fieldClass} mt-2 text-sm`} />
        </div>
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
          <div>
            <label htmlFor="tx-day" className={labelClass}>Date</label>
            <input id="tx-day" type="date" required value={day} max={today} onChange={(e) => setDay(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="tx-note" className={labelClass}>Note · optional</label>
            <input id="tx-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} placeholder="Lunch with Sam" />
          </div>
        </div>
        {error && <p role="alert" className="bg-paper px-3 py-2 text-sm text-ink">{error}</p>}
        <SlashButton type="submit" disabled={saving || !amount} className="w-full">
          {saving ? "Saving…" : kind === "expense" ? "Log spending" : "Log income"}
        </SlashButton>
      </form>
    </Panel>
  );
}

function WalletSettings({ settings, onSaved }: { settings: FinanceSettings; onSaved: (s: FinanceSettings) => void }) {
  const { backend } = useGame();
  const [currency, setCurrency] = useState(settings.currency);
  const [budget, setBudget] = useState(settings.monthlyBudget === null ? "" : String(settings.monthlyBudget));
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      onSaved(await backend.saveWalletSettings({ currency, monthlyBudget: budget === "" ? null : Number(budget) }));
      setMsg("Saved ✓");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't save.");
    }
  };
  return (
    <Panel title="Settings" kicker="Private">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="w-currency" className={labelClass}>Currency</label>
            <select id="w-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
              {[...new Set([settings.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="w-budget" className={labelClass}>Monthly budget</label>
            <input id="w-budget" type="number" inputMode="decimal" min={1} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="None" className={fieldClass} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SlashButton type="submit" variant="ghost">Save</SlashButton>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
        <p className="text-xs text-muted">Your wallet is private: visitors never see it, even when your profile is public.</p>
      </form>
    </Panel>
  );
}

export function WalletView() {
  const { data, backend, canEdit } = useGame();
  const [month, setMonth] = useState(monthOf(data.today));
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [txs, setTxs] = useState<MoneyTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TxKind>("all");

  useEffect(() => {
    let live = true;
    setTxs(null);
    setError(null);
    backend
      .loadWallet(month)
      .then((r) => {
        if (!live) return;
        setSettings(r.settings);
        setTxs(r.txs);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your wallet."));
    return () => {
      live = false;
    };
  }, [backend, month]);

  if (!canEdit) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-8">
        <PageHeader kicker="Treasury" title="Wallet" />
        <p className="text-muted">The wallet is private.</p>
      </main>
    );
  }

  const currency = settings?.currency ?? "USD";
  const summary = txs ? summarizeMonth(month, txs, settings?.monthlyBudget ?? null) : null;
  const isThisMonth = month === monthOf(data.today);
  const shownTxs = (txs ?? []).filter((t) => filter === "all" || t.kind === filter);
  const byDay = new Map<string, MoneyTx[]>();
  for (const t of shownTxs) byDay.set(t.occurredOn, [...(byDay.get(t.occurredOn) ?? []), t]);

  const remove = async (t: MoneyTx) => {
    if (!window.confirm(`Delete ${t.kind === "expense" ? "spending" : "income"} of ${formatMoney(t.amount, currency)} (${t.category})?`)) return;
    try {
      await backend.deleteTx(t.id);
      setTxs((all) => (all ?? []).filter((x) => x.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8">
      <PageHeader kicker="Treasury" title="Wallet">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson">‹</button>
          <span className="min-w-[10.5rem] text-center font-label text-lg font-extrabold tracking-wider uppercase">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isThisMonth} aria-label="Next month" className="skew-box bg-ink-3 px-3 py-1 font-display text-xl hover:bg-crimson disabled:opacity-30">›</button>
        </div>
      </PageHeader>

      {!data.extrasReady && (
        <p className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">
          The wallet needs a one-time database update: run <code>supabase/migrations/0005_rewards_wallet_calendar.sql</code> in the Supabase SQL Editor.
        </p>
      )}
      {error && <p role="alert" className="skew-box mb-6 bg-paper px-6 py-2 text-sm text-ink">{error}</p>}

      {summary && (
        <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Spent" value={formatMoney(summary.spent, currency)} sub={`${(txs ?? []).filter((t) => t.kind === "expense").length} entries`} />
          <StatTile label="Earned" value={formatMoney(summary.income, currency)} />
          <StatTile label="Net" value={formatMoney(summary.net, currency, { sign: true })} sub={summary.net >= 0 ? "Saved this month" : "More out than in"} />
          {settings?.monthlyBudget ? (
            <StatTile
              label="Budget left"
              value={formatMoney(summary.budgetLeft ?? 0, currency)}
              sub={(summary.budgetLeft ?? 0) < 0 ? "Over budget" : `of ${formatMoney(settings.monthlyBudget, currency, { compact: true })}`}
            >
              <div className="mt-2">
                <XpBar progress={summary.budgetUsed ?? 0} label="Budget used" size="sm" tone={(summary.budgetUsed ?? 0) > 1 ? "volt" : "crimson"} />
              </div>
            </StatTile>
          ) : (
            <StatTile label="Budget" value="—" sub="Set a monthly budget below" />
          )}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-10">
          <Panel title="Where it went" kicker={monthLabel(month)}>
            {!summary ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : summary.byCategory.length === 0 ? (
              <p className="text-sm text-muted">No spending logged this month.</p>
            ) : (
              <CategoryBars rows={summary.byCategory} total={summary.spent} currency={currency} />
            )}
          </Panel>
          {summary && summary.spent > 0 && (
            <Panel title="Day by day" kicker="Spending">
              <DailyBars days={summary.byDay} currency={currency} today={data.today} />
            </Panel>
          )}
          <Panel title="Entries" kicker={monthLabel(month)}>
            <div className="mb-4 flex gap-2">
              {(["all", "expense", "income"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`skew-box px-3 py-0.5 font-label text-sm font-extrabold tracking-wider uppercase ${filter === f ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
                >
                  {f === "all" ? "All" : f === "expense" ? "Spent" : "Earned"}
                </button>
              ))}
            </div>
            {!txs ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : byDay.size === 0 ? (
              <p className="text-sm text-muted">Nothing here yet.</p>
            ) : (
              <div className="space-y-4">
                {[...byDay].map(([day, list]) => (
                  <div key={day}>
                    <p className="mb-1 font-label text-xs font-extrabold tracking-widest text-muted uppercase">{day === data.today ? "Today" : dayLabel(day)}</p>
                    <ul className="divide-y divide-ink-3">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2">
                          <span className="skew-box w-24 shrink-0 truncate bg-ink-3 px-2 py-0.5 text-center font-label text-xs font-extrabold tracking-wider uppercase">{t.category}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {t.note ?? <span className="text-muted">—</span>}
                            {t.purchaseId && <span className="ml-2 font-label text-[11px] font-extrabold tracking-widest text-volt uppercase">◈ reward</span>}
                          </span>
                          <span className={`font-label text-base font-extrabold tabular-nums ${t.kind === "income" ? "text-volt" : ""}`}>
                            {formatMoney(t.kind === "income" ? t.amount : -t.amount, currency, { sign: true })}
                          </span>
                          <button onClick={() => void remove(t)} aria-label={`Delete ${t.category} entry`} className="px-1 text-muted opacity-60 hover:text-crimson hover:opacity-100">
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="order-first space-y-10 xl:order-none">
          <AddEntry
            today={data.today}
            onAdded={(tx) => {
              const m = monthOf(tx.occurredOn);
              if (m !== month) setMonth(m);
              else setTxs((all) => [tx, ...(all ?? [])].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)));
            }}
          />
          {settings && <WalletSettings settings={settings} onSaved={setSettings} />}
        </div>
      </div>
    </main>
  );
}
