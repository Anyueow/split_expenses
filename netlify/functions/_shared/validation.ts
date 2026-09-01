import {
  CATEGORIES,
  CURRENCIES,
  type Category,
  type Currency,
  type Member,
  type Split,
  type SplitType,
} from "../../../src/lib/types";
import { validateSplits } from "../../../src/lib/splitCalc";
import { HttpError } from "./http";

export const SPLIT_TYPES: SplitType[] = ["equal", "percentage", "exact"];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  EUR: "€",
  HUF: "Ft",
  USD: "$",
  INR: "₹",
  GBP: "£",
  CZK: "Kč",
};

export function formatMinor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/** "€45.00" for symbol currencies, "45.00 Ft" for the suffixed ones. */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  const amount = formatMinor(amountMinor);
  return symbol.length === 1 ? `${symbol}${amount}` : `${amount} ${symbol}`;
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "group";
}

/**
 * One trillion minor units. Sums of many expenses must stay well inside
 * Number.MAX_SAFE_INTEGER or the balances quietly stop netting to zero.
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

export function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_AMOUNT_MINOR
  );
}

/** The whole database is one JSON blob, so unbounded strings are a DoS vector. */
function requireNonEmptyString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

/** Dates are string-compared for sorting, so the format has to be exact. */
function requireIsoDate(value: unknown, field: string): string {
  const raw = requireNonEmptyString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new HttpError(400, `${field} must be a real date in YYYY-MM-DD form.`);
  }
  return raw;
}

export function requireCurrency(value: unknown): Currency {
  if (typeof value !== "string" || !CURRENCIES.includes(value as Currency)) {
    throw new HttpError(400, "Unsupported currency.");
  }
  return value as Currency;
}

function requireCategory(value: unknown): Category {
  if (typeof value !== "string" || !CATEGORIES.includes(value as Category)) {
    throw new HttpError(400, "Unknown category.");
  }
  return value as Category;
}

function requireSplitType(value: unknown): SplitType {
  if (typeof value !== "string" || !SPLIT_TYPES.includes(value as SplitType)) {
    throw new HttpError(400, "Unknown split type.");
  }
  return value as SplitType;
}

export interface ValidatedExpenseInput {
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

/**
 * Full server-side validation for expense writes. Pure — takes the raw body and
 * the group's members, throws HttpError(400) with a user-facing message.
 */
export function validateExpenseInput(
  body: Record<string, unknown>,
  members: Member[]
): ValidatedExpenseInput {
  const description = requireNonEmptyString(body.description, "Description");

  const amountMinor = body.amountMinor;
  if (!isPositiveInteger(amountMinor)) {
    throw new HttpError(400, "Amount must be a positive whole number of minor units.");
  }

  const currency = requireCurrency(body.currency);
  const category = requireCategory(body.category);
  const splitType = requireSplitType(body.splitType);
  const date = requireIsoDate(body.date, "Date");

  const memberIds = new Set(members.map((m) => m.id));
  const paidBy = requireNonEmptyString(body.paidBy, "Payer");
  if (!memberIds.has(paidBy)) {
    throw new HttpError(400, "The payer is not a member of this group.");
  }

  if (!Array.isArray(body.splits) || body.splits.length === 0) {
    throw new HttpError(400, "Select at least one person to split between.");
  }

  const seen = new Set<string>();
  const splits: Split[] = body.splits.map((raw) => {
    if (typeof raw !== "object" || raw === null) {
      throw new HttpError(400, "Invalid split entry.");
    }
    const entry = raw as Record<string, unknown>;
    const memberId = entry.memberId;
    if (typeof memberId !== "string" || !memberIds.has(memberId)) {
      throw new HttpError(400, "A split refers to someone who isn't in this group.");
    }
    if (seen.has(memberId)) {
      throw new HttpError(400, "Each person can only appear once in a split.");
    }
    seen.add(memberId);

    const split: Split = { memberId };

    if (splitType === "exact") {
      const value = entry.amountMinor;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new HttpError(400, "Split amounts must be whole minor units of zero or more.");
      }
      split.amountMinor = value;
    } else if (splitType === "percentage") {
      const value = entry.percentage;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new HttpError(400, "Split percentages must be zero or more.");
      }
      split.percentage = value;
    }

    return split;
  });

  const result = validateSplits(splitType, amountMinor, splits, members);
  if (!result.valid) {
    throw new HttpError(400, result.error ?? "Invalid splits.");
  }

  let note: string | undefined;
  if (body.note !== undefined && body.note !== null && body.note !== "") {
    if (typeof body.note !== "string") throw new HttpError(400, "Note must be text.");
    note = body.note.trim() || undefined;
  }

  return {
    description,
    amountMinor,
    currency,
    paidBy,
    splitType,
    splits,
    category,
    date,
    note,
  };
}

export interface ValidatedSettlementInput {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: Currency;
  date: string;
}

export function validateSettlementInput(
  body: Record<string, unknown>,
  members: Member[]
): ValidatedSettlementInput {
  const memberIds = new Set(members.map((m) => m.id));

  const fromMemberId = requireNonEmptyString(body.fromMemberId, "Payer");
  const toMemberId = requireNonEmptyString(body.toMemberId, "Recipient");
  if (!memberIds.has(fromMemberId) || !memberIds.has(toMemberId)) {
    throw new HttpError(400, "Both people must be members of this group.");
  }
  if (fromMemberId === toMemberId) {
    throw new HttpError(400, "A payment needs two different people.");
  }
  if (!isPositiveInteger(body.amountMinor)) {
    throw new HttpError(400, "Amount must be a positive whole number of minor units.");
  }

  return {
    fromMemberId,
    toMemberId,
    amountMinor: body.amountMinor,
    currency: requireCurrency(body.currency),
    date: requireIsoDate(body.date, "Date"),
  };
}
