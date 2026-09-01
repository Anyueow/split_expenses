import type { Member, Split, SplitType } from "./types";

/**
 * Sorts member IDs alphabetically by display name (case-insensitive),
 * falling back to ID for a stable, deterministic order among ties.
 */
function alphabeticalOrder(memberIds: string[], members: Member[]): string[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return [...memberIds].sort((a, b) => {
    const nameA = (nameById.get(a) ?? "").toLowerCase();
    const nameB = (nameById.get(b) ?? "").toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Splits amountMinor equally among participantMemberIds.
 * Rounding rule: base = floor(total / n); the remainder (in minor units,
 * e.g. cents/fillér) is distributed one unit at a time to participants
 * in alphabetical order by name, so the result is deterministic.
 */
export function computeEqualSplits(
  amountMinor: number,
  participantMemberIds: string[],
  members: Member[]
): Split[] {
  const n = participantMemberIds.length;
  if (n === 0) return [];
  const base = Math.floor(amountMinor / n);
  const remainder = amountMinor - base * n;
  const ordered = alphabeticalOrder(participantMemberIds, members);
  const extraSet = new Set(ordered.slice(0, remainder));
  return participantMemberIds.map((memberId) => ({
    memberId,
    amountMinor: base + (extraSet.has(memberId) ? 1 : 0),
  }));
}

/**
 * Converts percentage splits into minor-unit amounts. Uses the same
 * floor + alphabetical-remainder rule as equal splits so the sum of
 * the resulting amounts always equals amountMinor exactly.
 */
export function computePercentageSplits(
  amountMinor: number,
  splits: Split[],
  members: Member[]
): Split[] {
  const raw = splits.map((s) => {
    const exact = (amountMinor * (s.percentage ?? 0)) / 100;
    return { memberId: s.memberId, percentage: s.percentage, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const allocated = raw.reduce((sum, r) => sum + r.floor, 0);
  let remainder = amountMinor - allocated;

  // Distribute remaining minor units by largest fractional part first,
  // breaking ties alphabetically by name for determinism.
  const ordered = alphabeticalOrder(
    raw.map((r) => r.memberId),
    members
  );
  const orderIndex = new Map(ordered.map((id, i) => [id, i]));
  const byPriority = [...raw].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return (orderIndex.get(a.memberId) ?? 0) - (orderIndex.get(b.memberId) ?? 0);
  });

  const bonus = new Map<string, number>();
  for (let i = 0; i < byPriority.length && remainder > 0; i++, remainder--) {
    bonus.set(byPriority[i].memberId, 1);
  }

  return raw.map((r) => ({
    memberId: r.memberId,
    percentage: r.percentage,
    amountMinor: r.floor + (bonus.get(r.memberId) ?? 0),
  }));
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that splits balance against the expense total for the given
 * split type. Returns a human-readable error to show the user if not.
 */
export function validateSplits(
  splitType: SplitType,
  amountMinor: number,
  splits: Split[],
  members: Member[]
): ValidationResult {
  if (splits.length === 0) {
    return { valid: false, error: "Select at least one person to split between." };
  }
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { valid: false, error: "Enter an amount greater than zero." };
  }

  if (splitType === "equal") {
    return { valid: true };
  }

  if (splitType === "percentage") {
    const totalPct = splits.reduce((sum, s) => sum + (s.percentage ?? 0), 0);
    if (Math.round(totalPct * 100) !== 10000) {
      return {
        valid: false,
        error: `Percentages must add up to 100% (currently ${totalPct.toFixed(1)}%).`,
      };
    }
    return { valid: true };
  }

  // exact
  const totalExact = splits.reduce((sum, s) => sum + (s.amountMinor ?? 0), 0);
  if (totalExact !== amountMinor) {
    return {
      valid: false,
      error: `Split amounts must add up to the total (off by ${(
        (amountMinor - totalExact) /
        100
      ).toFixed(2)}).`,
    };
  }
  return { valid: true };
}

/**
 * Resolves the final per-member minor-unit shares for an expense,
 * regardless of split type. Use this everywhere balances are computed.
 */
export function resolveSplitAmounts(
  splitType: SplitType,
  amountMinor: number,
  splits: Split[],
  members: Member[]
): Record<string, number> {
  let resolved: Split[];
  if (splitType === "equal") {
    resolved = computeEqualSplits(
      amountMinor,
      splits.map((s) => s.memberId),
      members
    );
  } else if (splitType === "percentage") {
    resolved = computePercentageSplits(amountMinor, splits, members);
  } else {
    resolved = splits;
  }

  const result: Record<string, number> = {};
  for (const s of resolved) {
    result[s.memberId] = (result[s.memberId] ?? 0) + (s.amountMinor ?? 0);
  }
  return result;
}
