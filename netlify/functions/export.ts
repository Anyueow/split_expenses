import { requireAuth } from "./_shared/auth";
import { buildExpenseCsv, expensesForMember } from "./_shared/csvExport";
import {
  csv,
  handle,
  HttpError,
  methodNotAllowed,
  queryParam,
  requireQueryParam,
} from "./_shared/http";
import { getGroupData, readDb } from "./_shared/store";
import { slugify } from "./_shared/validation";

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  if (req.method !== "GET") return methodNotAllowed(req.method);

  const groupId = requireQueryParam(req, "groupId");
  const db = await readDb();
  const data = getGroupData(db, groupId);

  const sorted = [...data.expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  // Optional per-person view: only what they were part of, plus their own columns.
  const memberId = queryParam(req, "memberId");
  if (!memberId) {
    return csv(
      buildExpenseCsv(data.group.members, sorted),
      `${slugify(data.group.name)}-expenses.csv`
    );
  }

  const member = data.group.members.find((m) => m.id === memberId);
  if (!member) throw new HttpError(404, "Member not found");

  const mine = expensesForMember(data.group.members, sorted, memberId);
  return csv(
    buildExpenseCsv(data.group.members, mine, memberId),
    `${slugify(data.group.name)}-${slugify(member.name)}-expenses.csv`
  );
});
