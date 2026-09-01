import { nanoid } from "nanoid";
import type { Expense } from "../../src/lib/types";
import { pushActivity } from "./_shared/activity";
import { requireAuth } from "./_shared/auth";
import {
  handle,
  HttpError,
  json,
  methodNotAllowed,
  queryParam,
  readJsonBody,
  requireQueryParam,
} from "./_shared/http";
import { getGroupData, readDb, withDb } from "./_shared/store";
import { formatMoney, validateExpenseInput } from "./_shared/validation";

/** Most recent first: by calendar date, then by creation time within the same day. */
function byRecency(a: Expense, b: Expense): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return 0;
}

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  const groupId = requireQueryParam(req, "groupId");
  const expenseId = queryParam(req, "expenseId");

  if (req.method === "GET") {
    const db = await readDb();
    const data = getGroupData(db, groupId);
    return json({ expenses: [...data.expenses].sort(byRecency) });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const expense = await withDb((db) => {
      const data = getGroupData(db, groupId);
      const input = validateExpenseInput(body, data.group.members);
      const now = new Date().toISOString();

      const created: Expense = {
        id: nanoid(),
        groupId,
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      data.expenses.push(created);
      pushActivity(
        data,
        `Added "${created.description}" — ${formatMoney(created.amountMinor, created.currency)}`
      );
      return created;
    });
    return json({ expense });
  }

  if (req.method === "PUT") {
    if (!expenseId) throw new HttpError(400, "Missing expenseId");
    const body = await readJsonBody(req);
    const expense = await withDb((db) => {
      const data = getGroupData(db, groupId);
      const index = data.expenses.findIndex((e) => e.id === expenseId);
      if (index === -1) throw new HttpError(404, "Expense not found");

      const input = validateExpenseInput(body, data.group.members);
      const updated: Expense = {
        ...data.expenses[index],
        ...input,
        id: expenseId,
        groupId,
        updatedAt: new Date().toISOString(),
      };
      if (input.note === undefined) delete updated.note;

      data.expenses[index] = updated;
      pushActivity(
        data,
        `Edited "${updated.description}" — ${formatMoney(updated.amountMinor, updated.currency)}`
      );
      return updated;
    });
    return json({ expense });
  }

  if (req.method === "DELETE") {
    if (!expenseId) throw new HttpError(400, "Missing expenseId");
    await withDb((db) => {
      const data = getGroupData(db, groupId);
      const index = data.expenses.findIndex((e) => e.id === expenseId);
      if (index === -1) throw new HttpError(404, "Expense not found");

      const [removed] = data.expenses.splice(index, 1);
      pushActivity(
        data,
        `Deleted "${removed.description}" — ${formatMoney(removed.amountMinor, removed.currency)}`
      );
    });
    return json({ ok: true });
  }

  return methodNotAllowed(req.method);
});
