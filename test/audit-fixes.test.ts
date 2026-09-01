import { describe, expect, it } from "vitest";
import { computePercentageSplits, resolveSplitAmounts } from "../src/lib/splitCalc";
import Papa from "papaparse";
import { buildExpenseCsv } from "../netlify/functions/_shared/csvExport";
import type { Expense, Member } from "../src/lib/types";

const members: Member[] = [
  { id: "a", name: "Alice", color: "#6C5CE7" },
  { id: "b", name: "Bob", color: "#00B894" },
  { id: "c", name: "Cara", color: "#E17055" },
];

describe("percentage splits never invent or destroy money", () => {
  it("absorbs percentages that round to 100% but sum above it", () => {
    // 33.334 x3 = 100.002%, which the 2dp validator accepts.
    const splits = members.map((m) => ({ memberId: m.id, percentage: 33.334 }));
    const result = computePercentageSplits(1_000_000, splits, members);
    const sum = result.reduce((s, r) => s + (r.amountMinor ?? 0), 0);
    expect(sum).toBe(1_000_000);
  });

  it("absorbs percentages that sum just below 100%", () => {
    const splits = members.map((m) => ({ memberId: m.id, percentage: 33.333 }));
    const result = computePercentageSplits(1_000_000, splits, members);
    const sum = result.reduce((s, r) => s + (r.amountMinor ?? 0), 0);
    expect(sum).toBe(1_000_000);
  });

  it("holds for a range of amounts and participant counts", () => {
    for (const amount of [1, 7, 99, 1234, 100_000, 999_999_99]) {
      for (const n of [1, 2, 3]) {
        const some = members.slice(0, n);
        const pct = Number((100 / n).toFixed(3));
        const splits = some.map((m) => ({ memberId: m.id, percentage: pct }));
        const resolved = resolveSplitAmounts("percentage", amount, splits, some);
        const sum = Object.values(resolved).reduce((s, v) => s + v, 0);
        expect(sum, `amount=${amount} n=${n}`).toBe(amount);
      }
    }
  });

  it("returns nothing rather than looping when there are no splits", () => {
    expect(computePercentageSplits(500, [], members)).toEqual([]);
  });
});

describe("CSV export is not a formula-injection vector", () => {
  function csvFor(description: string, note = ""): string {
    const expense: Expense = {
      id: "e1",
      groupId: "g1",
      description,
      amountMinor: 1000,
      currency: "USD",
      paidBy: "a",
      splitType: "equal",
      splits: members.map((m) => ({ memberId: m.id })),
      category: "food",
      date: "2026-08-16",
      createdAt: "2026-08-16T12:00:00.000Z",
      updatedAt: "2026-08-16T12:00:00.000Z",
      note,
    };
    return buildExpenseCsv(members, [expense]);
  }

  it.each(["=1+1", "+1", "-1", "@SUM(A1)", '=HYPERLINK("http://evil","x")'])(
    "neutralises a description starting with %s",
    (payload) => {
      // Parse it back: the cell a spreadsheet would evaluate must be inert text.
      const [row] = Papa.parse<Record<string, string>>(csvFor(payload), {
        header: true,
        skipEmptyLines: true,
      }).data;
      expect(row.description).toBe(`'${payload}`);
      expect(/^[=+\-@]/.test(row.description)).toBe(false);
    }
  );

  it("neutralises a note as well", () => {
    const [row] = Papa.parse<Record<string, string>>(
      csvFor("Dinner", "=cmd|'/c calc'!A0"),
      { header: true, skipEmptyLines: true }
    ).data;
    expect(row.note).toBe("'=cmd|'/c calc'!A0");
  });

  it("leaves ordinary text alone", () => {
    const csv = csvFor("Budapest prosecco cruise!");
    expect(csv).toContain("Budapest prosecco cruise!");
    expect(csv).not.toContain("'Budapest");
  });
});
