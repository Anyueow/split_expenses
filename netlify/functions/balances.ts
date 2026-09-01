import { computeBalances } from "../../src/lib/settlement";
import { requireAuth } from "./_shared/auth";
import { handle, json, methodNotAllowed, requireQueryParam } from "./_shared/http";
import { getGroupData, readDb } from "./_shared/store";

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  if (req.method !== "GET") return methodNotAllowed(req.method);

  const groupId = requireQueryParam(req, "groupId");
  const db = await readDb();
  const data = getGroupData(db, groupId);

  const balances = computeBalances(data.group.members, data.expenses, data.settlements);

  return json({
    nets: balances.nets,
    transactions: balances.transactions,
    mixedCurrencies: balances.mixedCurrencies,
    currencies: balances.currencies,
    members: data.group.members,
  });
});
