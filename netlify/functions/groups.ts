import { nanoid } from "nanoid";
import {
  MEMBER_COLORS,
  type Currency,
  type Group,
  type GroupData,
  type Member,
} from "../../src/lib/types";
import { requireAuth } from "./_shared/auth";
import { pushActivity } from "./_shared/activity";
import {
  handle,
  HttpError,
  json,
  methodNotAllowed,
  queryParam,
  readJsonBody,
} from "./_shared/http";
import { getGroupData, readDb, withDb } from "./_shared/store";
import { requireCurrency } from "./_shared/validation";

function colorFor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function requireGroupName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "Group name is required.");
  }
  return value.trim();
}

function membersFromNames(names: unknown): Member[] {
  if (!Array.isArray(names) || names.length === 0) {
    throw new HttpError(400, "Add at least one person to the group.");
  }
  return names.map((raw, index) => {
    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new HttpError(400, "Every person needs a name.");
    }
    return { id: nanoid(), name: raw.trim(), color: colorFor(index) };
  });
}

/** Existing members keep their id and color; newly added ones get both assigned here. */
function normalizeMembers(raw: unknown, existing: Member[]): Member[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "A group needs at least one person.");
  }
  const existingById = new Map(existing.map((m) => [m.id, m]));
  const seen = new Set<string>();

  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new HttpError(400, "Invalid member entry.");
    }
    const member = entry as Partial<Member>;
    if (typeof member.name !== "string" || member.name.trim().length === 0) {
      throw new HttpError(400, "Every person needs a name.");
    }
    const id = typeof member.id === "string" && member.id ? member.id : nanoid();
    if (seen.has(id)) throw new HttpError(400, "Duplicate member.");
    seen.add(id);

    const prior = existingById.get(id);
    return {
      id,
      name: member.name.trim(),
      color: member.color ?? prior?.color ?? colorFor(index),
    };
  });
}

function assertRemovableMembers(data: GroupData, nextMembers: Member[]): void {
  const keptIds = new Set(nextMembers.map((m) => m.id));
  const removed = data.group.members.filter((m) => !keptIds.has(m.id));
  if (removed.length === 0) return;

  const inUse = new Set<string>();
  for (const expense of data.expenses) {
    inUse.add(expense.paidBy);
    for (const split of expense.splits) inUse.add(split.memberId);
  }
  for (const settlement of data.settlements) {
    inUse.add(settlement.fromMemberId);
    inUse.add(settlement.toMemberId);
  }

  const blocked = removed.find((m) => inUse.has(m.id));
  if (blocked) {
    throw new HttpError(400, `${blocked.name} has expenses and can't be removed.`);
  }
}

export default handle(async (req: Request): Promise<Response> => {
  requireAuth(req);
  const groupId = queryParam(req, "groupId");

  if (req.method === "GET" && !groupId) {
    const db = await readDb();
    const groups = Object.values(db.groups)
      .map((data) => ({
        ...data.group,
        expenseCount: data.expenses.length,
        totalSpentMinor: data.expenses.reduce((sum, e) => sum + e.amountMinor, 0),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return json({ groups });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const name = requireGroupName(body.name);
    const currency: Currency = requireCurrency(body.currency);
    const members = membersFromNames(body.members);

    const group: Group = {
      id: nanoid(),
      name,
      currency,
      members,
      createdAt: new Date().toISOString(),
    };

    const created = await withDb((db) => {
      const data: GroupData = { group, expenses: [], settlements: [], activity: [] };
      db.groups[group.id] = data;
      pushActivity(data, `Created the group "${group.name}"`);
      return data.group;
    });

    return json({ group: created });
  }

  if (!groupId) throw new HttpError(400, "Missing groupId");

  if (req.method === "GET") {
    const db = await readDb();
    const data = getGroupData(db, groupId);
    return json({
      group: data.group,
      expenses: data.expenses,
      settlements: data.settlements,
      activity: data.activity,
    });
  }

  if (req.method === "PUT") {
    const body = await readJsonBody(req);
    const group = await withDb((db) => {
      const data = getGroupData(db, groupId);

      if (body.name !== undefined) data.group.name = requireGroupName(body.name);
      if (body.currency !== undefined) data.group.currency = requireCurrency(body.currency);
      if (body.members !== undefined) {
        const nextMembers = normalizeMembers(body.members, data.group.members);
        assertRemovableMembers(data, nextMembers);
        data.group.members = nextMembers;
      }

      pushActivity(data, `Updated group settings`);
      return data.group;
    });
    return json({ group });
  }

  if (req.method === "DELETE") {
    await withDb((db) => {
      getGroupData(db, groupId);
      delete db.groups[groupId];
    });
    return json({ ok: true });
  }

  return methodNotAllowed(req.method);
});
