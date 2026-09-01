import { nanoid } from "nanoid";
import type { Member, Settlement } from "../../src/lib/types";
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
import { formatMoney, validateSettlementInput } from "./_shared/validation";

function byRecency(a: Settlement, b: Settlement): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return 0;
}

function nameOf(members: Member[], memberId: string): string {
  return members.find((m) => m.id === memberId)?.name ?? "Someone";
}

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  const groupId = requireQueryParam(req, "groupId");
  const settlementId = queryParam(req, "settlementId");

  if (req.method === "GET") {
    const db = await readDb();
    const data = getGroupData(db, groupId);
    return json({ settlements: [...data.settlements].sort(byRecency) });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const settlement = await withDb((db) => {
      const data = getGroupData(db, groupId);
      const input = validateSettlementInput(body, data.group.members);

      const created: Settlement = {
        id: nanoid(),
        groupId,
        ...input,
        createdAt: new Date().toISOString(),
      };
      data.settlements.push(created);

      const members = data.group.members;
      pushActivity(
        data,
        `${nameOf(members, created.fromMemberId)} paid ${nameOf(
          members,
          created.toMemberId
        )} ${formatMoney(created.amountMinor, created.currency)}`
      );
      return created;
    });
    return json({ settlement });
  }

  if (req.method === "DELETE") {
    if (!settlementId) throw new HttpError(400, "Missing settlementId");
    await withDb((db) => {
      const data = getGroupData(db, groupId);
      const index = data.settlements.findIndex((s) => s.id === settlementId);
      if (index === -1) throw new HttpError(404, "Settlement not found");

      const [removed] = data.settlements.splice(index, 1);
      const members = data.group.members;
      pushActivity(
        data,
        `Removed a payment from ${nameOf(members, removed.fromMemberId)} to ${nameOf(
          members,
          removed.toMemberId
        )} — ${formatMoney(removed.amountMinor, removed.currency)}`
      );
    });
    return json({ ok: true });
  }

  return methodNotAllowed(req.method);
});
