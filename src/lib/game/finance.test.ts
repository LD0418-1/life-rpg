import { describe, expect, it } from "vitest";
import { type MoneyTx, formatMoney, monthRange, normalizeFinanceSettings, normalizeTx, shiftMonth, summarizeMonth } from "./finance";
import { cleanReward, normalizeNewQuest } from "./quests";

const tx = (occurredOn: string, kind: MoneyTx["kind"], amount: number, category: string): MoneyTx => ({
  id: `${occurredOn}-${amount}`, occurredOn, kind, amount, category, note: null, purchaseId: null,
});

describe("wallet entries", () => {
  it("cleans valid entries", () => {
    expect(normalizeTx({ occurredOn: "2026-11-10", kind: "expense", amount: 12.345, category: "  Food ", note: " lunch " })).toMatchObject({
      amount: 12.35, category: "Food", note: "lunch", purchaseId: null,
    });
  });
  it("rejects bad entries", () => {
    const base = { occurredOn: "2026-11-10", kind: "expense" as const, amount: 5, category: "Food", note: "" };
    expect(() => normalizeTx({ ...base, amount: 0 })).toThrow(/more than 0/);
    expect(() => normalizeTx({ ...base, amount: 1e9 })).toThrow(/too large/);
    expect(() => normalizeTx({ ...base, category: " " })).toThrow(/category/);
    expect(() => normalizeTx({ ...base, occurredOn: "2026-13-01" })).toThrow(/date/);
  });
  it("validates settings", () => {
    expect(normalizeFinanceSettings({ currency: "cny", monthlyBudget: 4000 })).toEqual({ currency: "CNY", monthlyBudget: 4000 });
    expect(normalizeFinanceSettings({ currency: "USD", monthlyBudget: null })).toEqual({ currency: "USD", monthlyBudget: null });
    expect(() => normalizeFinanceSettings({ currency: "dollars", monthlyBudget: null })).toThrow(/3-letter/);
    expect(() => normalizeFinanceSettings({ currency: "USD", monthlyBudget: -5 })).toThrow(/positive/);
  });
});

describe("months", () => {
  it("knows month ranges, including leap years", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("moves between months", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("summarizes a month: totals, categories biggest first, daily spend, budget", () => {
    const s = summarizeMonth(
      "2026-11",
      [tx("2026-11-01", "income", 3000, "Salary"), tx("2026-11-02", "expense", 40, "Food"), tx("2026-11-02", "expense", 10.5, "Food"),
        tx("2026-11-05", "expense", 120, "Shopping"), tx("2026-10-31", "expense", 999, "Food")],
      500,
    );
    expect(s).toMatchObject({ spent: 170.5, income: 3000, net: 2829.5, budgetLeft: 329.5 });
    expect(s.byCategory).toEqual([{ category: "Shopping", amount: 120 }, { category: "Food", amount: 50.5 }]);
    expect(s.byDay).toHaveLength(30);
    expect(s.byDay[1]).toEqual({ day: "2026-11-02", amount: 50.5 });
    expect(s.budgetUsed).toBeCloseTo(0.341);
  });
  it("formats money", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(-20, "USD", { sign: true })).toBe("−$20.00");
    expect(formatMoney(20, "EUR", { sign: true })).toBe("+€20.00");
  });
});

describe("quest rewards and quick tasks", () => {
  it("cleans reward text", () => {
    expect(cleanReward("  Buy new clothes ")).toBe("Buy new clothes");
    expect(cleanReward("   ")).toBeNull();
    expect(() => cleanReward("x".repeat(121))).toThrow(/120/);
  });
  it("lets a side quest with no objectives be a one-step task named after itself", () => {
    const q = normalizeNewQuest({ kind: "side", title: "Math lecture", domain: "mind", xpReward: 50, isBoss: false, objectives: [""] });
    expect(q.objectives).toEqual(["Math lecture"]);
  });
});
