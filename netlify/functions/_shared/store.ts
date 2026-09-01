import { getStore } from "@netlify/blobs";
import type { GroupData } from "../../../src/lib/types";
import { HttpError } from "./http";

export interface Db {
  groups: Record<string, GroupData>;
}

const STORE_NAME = "spliteasy";
const DB_KEY = "db";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function readDb(): Promise<Db> {
  const raw = await store().get(DB_KEY, { type: "json" });
  if (!raw || typeof raw !== "object") return { groups: {} };
  const db = raw as Partial<Db>;
  return { groups: db.groups ?? {} };
}

export async function writeDb(db: Db): Promise<void> {
  await store().setJSON(DB_KEY, db);
}

/** Single funnel for every mutation: read, mutate, persist, return the result. */
export async function withDb<T>(mutator: (db: Db) => T | Promise<T>): Promise<T> {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

export function getGroupData(db: Db, groupId: string): GroupData {
  const data = db.groups[groupId];
  if (!data) throw new HttpError(404, "Group not found");
  return data;
}
