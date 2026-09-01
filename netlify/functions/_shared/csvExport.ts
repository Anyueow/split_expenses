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

/** Distinct header per member even when two people share a name. */
function memberColumnNames(members: Member[]): string[] {
  const counts = new Map<string, number>();
  return members.map((m) => {
    const seen = (counts.get(m.name) ?? 0) + 1;
    counts.set(m.name, seen);
    return seen === 1 ? m.name : `${m.name} (${seen})`;
  });
}

export function buildExpenseCsv(members: Member[], expenses: Expense[]): string {
  const memberColumns = memberColumnNames(members);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const rows = expenses.map((expense) => {
    const shares = resolveSplitAmounts(
      expense.splitType,
      expense.amountMinor,
      expense.splits,
      members
    );

    const row: Record<string, string> = {
      date: expense.date,
      description: expense.description,
      amount: formatMinor(expense.amountMinor),
      currency: expense.currency,
      category: expense.category,
      paid_by: nameById.get(expense.paidBy) ?? "",
      split_type: expense.splitType,
      note: expense.note ?? "",
    };

    members.forEach((member, index) => {
      row[memberColumns[index]] = formatMinor(shares[member.id] ?? 0);
    });

    return row;
  });

  return Papa.unparse(
    { fields: [...BASE_COLUMNS, ...memberColumns], data: rows },
    { newline: "\r\n" }
  );
}
