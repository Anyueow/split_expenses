import Papa from "papaparse";
import { resolveSplitAmounts } from "../../../src/lib/splitCalc";
import type { Expense, Member } from "../../../src/lib/types";
import { formatMinor } from "./validation";

const BASE_COLUMNS = [
  "date",
  "description",
  "amount",
  "currency",
  "category",
  "paid_by",
  "split_type",
  "note",
] as const;

/**
 * Excel and Sheets execute a cell that opens with =, +, -, @ or a control
 * character, so a description like `=HYPERLINK(...)` would run on whoever opens
 * the export. Prefixing with an apostrophe makes the cell literal text.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Distinct header per member even when two people share a name. */
function memberColumnNames(members: Member[]): string[] {
  const counts = new Map<string, number>();
  return members.map((m) => {
    const seen = (counts.get(m.name) ?? 0) + 1;
    counts.set(m.name, seen);
    const label = seen === 1 ? m.name : `${m.name} (${seen})`;
    return neutralizeFormula(label);
  });
}

/** Expenses the member paid for or holds a share of. */
export function expensesForMember(
  members: Member[],
  expenses: Expense[],
  memberId: string
): Expense[] {
  return expenses.filter((expense) => {
    if (expense.paidBy === memberId) return true;
    const shares = resolveSplitAmounts(
      expense.splitType,
      expense.amountMinor,
      expense.splits,
      members
    );
    // Membership, not a positive amount: a 0.00 exact split still means they
    // were on the bill, and dropping it breaks reconciliation.
    return expense.splits.some((s) => s.memberId === memberId) || (shares[memberId] ?? 0) > 0;
  });
}

export function buildExpenseCsv(
  members: Member[],
  expenses: Expense[],
  /** When set, appends that person's own paid/share/net columns. */
  memberId?: string
): string {
  const memberColumns = memberColumnNames(members);
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const povColumns = memberId ? (["you_paid", "your_share", "your_net"] as const) : [];

  const rows = expenses.map((expense) => {
    const shares = resolveSplitAmounts(
      expense.splitType,
      expense.amountMinor,
      expense.splits,
      members
    );

    const row: Record<string, string> = {
      date: neutralizeFormula(expense.date),
      description: neutralizeFormula(expense.description),
      amount: formatMinor(expense.amountMinor),
      currency: expense.currency,
      category: expense.category,
      paid_by: neutralizeFormula(nameById.get(expense.paidBy) ?? ""),
      split_type: expense.splitType,
      note: neutralizeFormula(expense.note ?? ""),
    };

    members.forEach((member, index) => {
      row[memberColumns[index]] = formatMinor(shares[member.id] ?? 0);
    });

    if (memberId) {
      const paid = expense.paidBy === memberId ? expense.amountMinor : 0;
      const share = shares[memberId] ?? 0;
      row.you_paid = formatMinor(paid);
      row.your_share = formatMinor(share);
      row.your_net = formatMinor(paid - share);
    }

    return row;
  });

  return Papa.unparse(
    { fields: [...BASE_COLUMNS, ...memberColumns, ...povColumns], data: rows },
    { newline: "\r\n" }
  );
}
