"use server";

// Wallet: your real money in and out. Private to you (owner-only in the database).
import { type FinanceSettings, type MoneyTx, type NewTxInput, monthRange, normalizeFinanceSettings, normalizeTx } from "@/lib/game/finance";
import { type ActionResult, ownerContext, run } from "@/lib/server/action-helpers";
import { type MoneyTxRow, TX_COLUMNS, toMoneyTx } from "@/lib/supabase/rows";
import { isMissingRelation } from "@/lib/supabase/streak-data";

const NEEDS_0005 = "The wallet needs a one-time database update first: run supabase/migrations/0005_rewards_wallet_calendar.sql in the Supabase SQL Editor.";

function fail(error: { message: string; code?: string }): never {
  throw new Error(isMissingRelation(error) ? NEEDS_0005 : error.message);
}

export async function loadWalletAction(month: string): Promise<ActionResult<{ settings: FinanceSettings; txs: MoneyTx[] }>> {
  return run(async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Bad month.");
    const { supabase } = await ownerContext();
    const { from, to } = monthRange(month);
    const [settings, txs] = await Promise.all([
      supabase.from("finance_settings").select("currency, monthly_budget").maybeSingle<{ currency: string; monthly_budget: number | string | null }>(),
      supabase.from("money_tx").select(TX_COLUMNS).gte("occurred_on", from).lte("occurred_on", to).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (settings.error) fail(settings.error);
    if (txs.error) fail(txs.error);
    return {
      settings: {
        currency: settings.data?.currency ?? "USD",
        monthlyBudget: settings.data?.monthly_budget == null ? null : Number(settings.data.monthly_budget),
      },
      txs: ((txs.data ?? []) as MoneyTxRow[]).map(toMoneyTx),
    };
  });
}

export async function addTxAction(input: NewTxInput): Promise<ActionResult<MoneyTx>> {
  return run(async () => {
    const tx = normalizeTx(input);
    const { supabase } = await ownerContext();
    const { data, error } = await supabase
      .from("money_tx")
      .insert({ occurred_on: tx.occurredOn, kind: tx.kind, amount: tx.amount, category: tx.category, note: tx.note, purchase_id: tx.purchaseId })
      .select(TX_COLUMNS)
      .single<MoneyTxRow>();
    if (error) fail(error);
    return toMoneyTx(data);
  });
}

export async function deleteTxAction(txId: string): Promise<ActionResult<void>> {
  return run(async () => {
    const { supabase } = await ownerContext();
    const { data, error } = await supabase.from("money_tx").delete().eq("id", txId).select("id");
    if (error) fail(error);
    if (!data?.length) throw new Error("That entry is already gone.");
  });
}

export async function saveWalletSettingsAction(input: FinanceSettings): Promise<ActionResult<FinanceSettings>> {
  return run(async () => {
    const settings = normalizeFinanceSettings(input);
    const { supabase } = await ownerContext();
    const { error } = await supabase
      .from("finance_settings")
      .upsert({ id: 1, currency: settings.currency, monthly_budget: settings.monthlyBudget }, { onConflict: "id" });
    if (error) fail(error);
    return settings;
  });
}
