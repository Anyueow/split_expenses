import { describe, expect, it } from "vitest";
import type { Expense, Member } from "../src/lib/types";

/**
 * Mirrors the filter/sort pipeline in ExpensesTab so the combination of
 * payer + category + search + sort is exercised without a DOM.
 */
const members: Member[] = [
  { id: "i", name: "Irene Joe", color: "#6C5CE7" },
  { id: "a", name: "Ananya Shah", color: "#00B894" },
  { id: "s", name: "Sruthi C", color: "#E17055" },
];

function expense(over: Partial<Expense>): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g",
    description: "Thing",
    amountMinor: 1000,
    currency: "USD",
    paidBy: "i",
    splitType: "equal",
    splits: members.map((m) => ({ memberId: m.id })),
    category: "food",
    date: "2026-08-16",
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    ...over,
  };
}

const data: Expense[] = [
  expense({ description: "Menza", paidBy: "i", amountMinor: 9431, date: "2026-08-17" }),
  expense({ description: "Opera tix", paidBy: "a", amountMinor: 5987, category: "activities", date: "2026-08-16" }),
  expense({ description: "Langos", paidBy: "s", amountMinor: 1215, date: "2026-08-24" }),
  expense({ description: "Wine", paidBy: "s", amountMinor: 1484, category: "drinks", date: "2026-08-24" }),
];

const nameById = new Map(members.map((m) => [m.id, m.name.toLowerCase()]));

function apply(opts: { paidBy?: string; category?: string; query?: string; sort?: string }) {
  const { paidBy = "all", category = "all", query = "", sort = "date-desc" } = opts;
  const q = query.trim().toLowerCase();
  const visible = data.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (paidBy !== "all" && e.paidBy !== paidBy) return false;
    if (!q) return true;
    return (
      e.description.toLowerCase().includes(q) ||
      (e.note?.toLowerCase().includes(q) ?? false) ||
      (nameById.get(e.paidBy) ?? "").includes(q) ||
      e.category.includes(q) ||
      (e.amountMinor / 100).toFixed(2).includes(q)
    );
  });
  const list = [...visible];
  list.sort((a, b) => {
    switch (sort) {
      case "amount-desc":
        return b.amountMinor - a.amountMinor;
      case "amount-asc":
        return a.amountMinor - b.amountMinor;
      case "date-asc":
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      default:
        return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    }
  });
  return list.map((e) => e.description);
}

describe("filter by payer", () => {
  it("shows everything by default", () => {
    expect(apply({})).toHaveLength(4);
  });

  it("narrows to one payer", () => {
    expect(apply({ paidBy: "s" }).sort()).toEqual(["Langos", "Wine"]);
    expect(apply({ paidBy: "a" })).toEqual(["Opera tix"]);
  });

  it("combines with the category filter", () => {
    expect(apply({ paidBy: "s", category: "drinks" })).toEqual(["Wine"]);
    expect(apply({ paidBy: "s", category: "activities" })).toEqual([]);
  });

  it("combines with search", () => {
    expect(apply({ paidBy: "s", query: "lang" })).toEqual(["Langos"]);
    // Search matches payer names too; the payer filter must still constrain it.
    expect(apply({ paidBy: "a", query: "sruthi" })).toEqual([]);
  });

  it("combines with sorting", () => {
    expect(apply({ paidBy: "s", sort: "amount-desc" })).toEqual(["Wine", "Langos"]);
    expect(apply({ paidBy: "s", sort: "amount-asc" })).toEqual(["Langos", "Wine"]);
  });

  it("returns nothing for a payer with no expenses", () => {
    expect(apply({ paidBy: "nobody" })).toEqual([]);
  });
});

describe("payer options", () => {
  const payersFor = (list: Expense[]) => {
    const ids = new Set(list.map((e) => e.paidBy));
    return members.filter((m) => ids.has(m.id)).map((m) => m.name);
  };

  it("offers only people who actually paid", () => {
    expect(payersFor(data)).toEqual(["Irene Joe", "Ananya Shah", "Sruthi C"]);
    expect(payersFor([data[1]])).toEqual(["Ananya Shah"]);
  });

  it("keeps group order rather than order of appearance", () => {
    expect(payersFor([data[2], data[1]])).toEqual(["Ananya Shah", "Sruthi C"]);
  });

  it("is empty when there are no expenses", () => {
    expect(payersFor([])).toEqual([]);
  });
});
