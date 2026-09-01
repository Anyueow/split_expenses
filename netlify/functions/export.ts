import { requireAuth } from "./_shared/auth";
import { buildExpenseCsv } from "./_shared/csvExport";
import { csv, handle, methodNotAllowed, requireQueryParam } from "./_shared/http";
import { getGroupData, readDb } from "./_shared/store";
import { slugify } from "./_shared/validation";

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  if (req.method !== "GET") return methodNotAllowed(req.method);

  const groupId = requireQueryParam(req, "groupId");
  const db = await readDb();
  const data = getGroupData(db, groupId);

  const expenses = [...data.expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return csv(
    buildExpenseCsv(data.group.members, expenses),
    `${slugify(data.group.name)}-expenses.csv`
  );
});
