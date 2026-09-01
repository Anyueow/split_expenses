import type {
  ActivityEvent,
  Category,
  Currency,
  Expense,
  Group,
  Member,
  Settlement,
  SettlementPlan,
  Split,
  SplitType,
} from "./types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Lets AuthContext react to a dead session from any call site without
 * every page having to inspect error codes itself.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `Something went wrong (${response.status}).`;

    if (response.status === 401) {
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError(response.status, message);
  }

  return body as T;
}

function json(method: string, payload?: unknown): RequestInit {
  return {
    method,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

/* ---- Auth -------------------------------------------------------------- */

export function probeAuth(): Promise<{ authenticated: boolean }> {
  return request("/auth");
}

export function login(password: string): Promise<{ ok: true }> {
  return request("/auth", json("POST", { password }));
}

export function logout(): Promise<{ ok: true }> {
  return request("/auth/logout", json("POST"));
}

/* ---- Groups ------------------------------------------------------------ */

export type GroupSummary = Group & {
  expenseCount: number;
  totalSpentMinor: number;
};

/** New members are sent without an id; the server assigns one. */
export interface MemberInput {
  id?: string;
  name: string;
  color?: string;
}

export function listGroups(): Promise<{ groups: GroupSummary[] }> {
  return request("/groups");
}

export function createGroup(payload: {
  name: string;
  currency: Currency;
  members: string[];
}): Promise<{ group: Group }> {
  return request("/groups", json("POST", payload));
}

export function getGroup(groupId: string): Promise<{
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  activity: ActivityEvent[];
}> {
  return request(`/groups/${groupId}`);
}

export function updateGroup(
  groupId: string,
  payload: { name?: string; currency?: Currency; members?: MemberInput[] }
): Promise<{ group: Group }> {
  return request(`/groups/${groupId}`, json("PUT", payload));
}

export function deleteGroup(groupId: string): Promise<{ ok: true }> {
  return request(`/groups/${groupId}`, json("DELETE"));
}

/* ---- Expenses ---------------------------------------------------------- */

export interface ExpenseInput {
  description: string;
  amountMinor: number;
  currency: Currency;
  paidBy: string;
  splitType: SplitType;
  splits: Split[];
  category: Category;
  date: string;
  note?: string;
}

export function listExpenses(groupId: string): Promise<{ expenses: Expense[] }> {
  return request(`/groups/${groupId}/expenses`);
}

export function createExpense(
  groupId: string,
  payload: ExpenseInput
): Promise<{ expense: Expense }> {
  return request(`/groups/${groupId}/expenses`, json("POST", payload));
}

export function updateExpense(
  groupId: string,
  expenseId: string,
  payload: ExpenseInput
): Promise<{ expense: Expense }> {
  return request(`/groups/${groupId}/expenses/${expenseId}`, json("PUT", payload));
}

export function deleteExpense(groupId: string, expenseId: string): Promise<{ ok: true }> {
  return request(`/groups/${groupId}/expenses/${expenseId}`, json("DELETE"));
}

/* ---- Balances & settlements -------------------------------------------- */

export interface BalancesResponse {
  nets: Record<string, number>;
  transactions: SettlementPlan[];
  mixedCurrencies: boolean;
  currencies: Currency[];
  members: Member[];
}

export function getBalances(groupId: string): Promise<BalancesResponse> {
  return request(`/groups/${groupId}/balances`);
}

export function listSettlements(groupId: string): Promise<{ settlements: Settlement[] }> {
  return request(`/groups/${groupId}/settlements`);
}

export function createSettlement(
  groupId: string,
  payload: {
    fromMemberId: string;
    toMemberId: string;
    amountMinor: number;
    currency: Currency;
    date: string;
  }
): Promise<{ settlement: Settlement }> {
  return request(`/groups/${groupId}/settlements`, json("POST", payload));
}

export function deleteSettlement(
  groupId: string,
  settlementId: string
): Promise<{ ok: true }> {
  return request(`/groups/${groupId}/settlements/${settlementId}`, json("DELETE"));
}

/* ---- Export ------------------------------------------------------------ */

/** A plain navigation, so the browser handles the Content-Disposition download. */
export function exportCsvUrl(groupId: string): string {
  return `/api/groups/${groupId}/export`;
}
