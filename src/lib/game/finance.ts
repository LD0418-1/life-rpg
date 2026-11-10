// Wallet: real money in and out, by category and month.
import { addDays, isDay } from "./streaks";

export type TxKind = "expense" | "income";

export interface MoneyTx {
  id: string;
  occurredOn: string;
  kind: TxKind;
  amount: number;
  category: string;
  note: string | null;
  /** Set when this spend came from using an inventory reward. */
  purchaseId: string | null;
}

export interface NewTxInput {
  occurredOn: string;
  kind: TxKind;
  amount: number;
  category: string;
  note: string;
  purchaseId?: string | null;
}

export interface FinanceSettings {
  currency: string;
  monthlyBudget: number | null;
}

export const EXPENSE_CATEGORIES = ["Food", "Groceries", "Transport", "Shopping", "Bills", "Fun", "Health", "Education", "Rewards", "Other"];
export const INCOME_CATEGORIES = ["Salary", "Side income", "Gift", "Refund", "Other"];
export const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "HKD", "TWD", "SGD", "CAD", "AUD", "KRW"];
export const MAX_AMOUNT = 10_000_000;

export function normalizeTx(input: NewTxInput) {
  if (input.kind !== "expense" && input.kind !== "income") throw new Error("Pick expense or income.");
  if (!isDay(input.occurredOn)) throw new Error("Pick a valid date.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be more than 0.");
  if (amount > MAX_AMOUNT) throw new Error("That amount looks too large. Typo?");
  const category = input.category.trim().replace(/\s+/g, " ");
  if (!category) throw new Error("Pick a category.");
  if (category.length > 40) throw new Error("Keep category names under 40 characters.");
  const note = input.note.trim().slice(0, 200) || null;
  return { occurredOn: input.occurredOn, kind: input.kind, amount, category, note, purchaseId: input.purchaseId ?? null };
}

export function normalizeFinanceSettings(input: { currency: string; monthlyBudget: number | null }): FinanceSettings {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code like USD or CNY.");
  let monthlyBudget: number | null = null;
  if (input.monthlyBudget !== null && input.monthlyBudget !== undefined && String(input.monthlyBudget) !== "") {
    monthlyBudget = Math.round(Number(input.monthlyBudget) * 100) / 100;
    if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0 || monthlyBudget > MAX_AMOUNT) throw new Error("Budget must be a positive amount.");
  }
  return { currency, monthlyBudget };
}

/** "2026-11" for a day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** First and last day of a month like "2026-11". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: `${month}-01`, to: addDays(next, -1) };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface MonthSummary {
  spent: number;
  income: number;
  net: number;
  byCategory: { category: string; amount: number }[];
  byDay: { day: string; amount: number }[];
  budgetLeft: number | null;
  budgetUsed: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarizeMonth(month: string, txs: ReadonlyArray<MoneyTx>, budget: number | null): MonthSummary {
  const { from, to } = monthRange(month);
  const inMonth = txs.filter((t) => t.occurredOn >= from && t.occurredOn <= to);
  const spentTx = inMonth.filter((t) => t.kind === "expense");
  const spent = cents(spentTx.reduce((s, t) => s + t.amount, 0));
  const income = cents(inMonth.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0));
  const cats = new Map<string, number>();
  for (const t of spentTx) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const days: { day: string; amount: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, amount: 0 });
  for (const t of spentTx) {
    const slot = days.find((x) => x.day === t.occurredOn);
    if (slot) slot.amount = cents(slot.amount + t.amount);
  }
  return {
    spent,
    income,
    net: cents(income - spent),
    byCategory: [...cats].map(([category, amount]) => ({ category, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
    byDay: days,
    budgetLeft: budget === null ? null : cents(budget - spent),
    budgetUsed: budget === null ? null : spent / budget,
  };
}

export function formatMoney(amount: number, currency: string, opts: { sign?: boolean; compact?: boolean } = {}): string {
  let text: string;
  try {
    text = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: opts.compact ? 0 : 2,
      minimumFractionDigits: opts.compact ? 0 : undefined,
    }).format(Math.abs(amount));
  } catch {
    text = `${Math.abs(amount).toFixed(2)} ${currency}`;
  }
  if (!opts.sign) return amount < 0 ? `−${text}` : text;
  return `${amount < 0 ? "−" : "+"}${text}`;
}
