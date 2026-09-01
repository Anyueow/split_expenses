import { describe, expect, it } from "vitest";
import {
  computeEqualSplits,
  computePercentageSplits,
  resolveSplitAmounts,
  validateSplits,
} from "../src/lib/splitCalc";
import type { Member, Split } from "../src/lib/types";

const alice: Member = { id: "m-alice", name: "Alice", color: "#6C5CE7" };
const bob: Member = { id: "m-bob", name: "Bob", color: "#00B894" };
const cara: Member = { id: "m-cara", name: "Cara", color: "#E17055" };
const dan: Member = { id: "m-dan", name: "Dan", color: "#0984E3" };
const members = [alice, bob, cara, dan];

const sum = (splits: Split[]) => splits.reduce((t, s) => t + (s.amountMinor ?? 0), 0);
const byId = (splits: Split[], id: string) =>
  splits.find((s) => s.memberId === id)?.amountMinor;

describe("computeEqualSplits", () => {
  it("splits an evenly divisible amount with no remainder", () => {
    const splits = computeEqualSplits(3000, [alice.id, bob.id, cara.id], members);
    expect(splits.map((s) => s.amountMinor)).toEqual([1000, 1000, 1000]);
    expect(sum(splits)).toBe(3000);
  });

  it("gives the remainder to the first participant alphabetically", () => {
    // €10.00 / 3 = 333.33… → 334 / 333 / 333
    const splits = computeEqualSplits(1000, [cara.id, bob.id, alice.id], members);
    expect(sum(splits)).toBe(1000);
    expect(byId(splits, alice.id)).toBe(334);
    expect(byId(splits, bob.id)).toBe(333);
    expect(byId(splits, cara.id)).toBe(333);
  });

  it("spreads a two-unit remainder across the first two alphabetically", () => {
    // 1001 / 3 = 333 remainder 2, shared between Bob and Cara
    const splits = computeEqualSplits(1001, [dan.id, cara.id, bob.id], members);
    expect(sum(splits)).toBe(1001);
    expect(byId(splits, bob.id)).toBe(334);
    expect(byId(splits, cara.id)).toBe(334);
    expect(byId(splits, dan.id)).toBe(333);
  });

  it("is deterministic regardless of the order participants are passed in", () => {
    const a = computeEqualSplits(1000, [alice.id, bob.id, cara.id], members);
    const b = computeEqualSplits(1000, [cara.id, alice.id, bob.id], members);
    expect(byId(a, alice.id)).toBe(byId(b, alice.id));
    expect(byId(a, bob.id)).toBe(byId(b, bob.id));
    expect(byId(a, cara.id)).toBe(byId(b, cara.id));
  });

  it("assigns the whole amount to a single participant", () => {
    const splits = computeEqualSplits(4567, [bob.id], members);
    expect(splits).toEqual([{ memberId: bob.id, amountMinor: 4567 }]);
  });

  it("handles a member being excluded from the split", () => {
    const splits = computeEqualSplits(1000, [alice.id, bob.id], members);
    expect(sum(splits)).toBe(1000);
    expect(byId(splits, cara.id)).toBeUndefined();
  });

  it("returns no splits when nobody participates", () => {
    expect(computeEqualSplits(1000, [], members)).toEqual([]);
  });

  it("never loses or invents minor units across many divisors", () => {
    const ids = members.map((m) => m.id);
    for (let amount = 1; amount <= 200; amount++) {
      for (let n = 1; n <= 4; n++) {
        expect(sum(computeEqualSplits(amount, ids.slice(0, n), members))).toBe(amount);
      }
    }
  });
});

describe("computePercentageSplits", () => {
  it("converts clean percentages to exact amounts", () => {
    const splits = computePercentageSplits(
      10000,
      [
        { memberId: alice.id, percentage: 50 },
        { memberId: bob.id, percentage: 25 },
        { memberId: cara.id, percentage: 25 },
      ],
      members
    );
    expect(byId(splits, alice.id)).toBe(5000);
    expect(byId(splits, bob.id)).toBe(2500);
    expect(byId(splits, cara.id)).toBe(2500);
    expect(sum(splits)).toBe(10000);
  });

  it("still sums to the total when percentages do not divide evenly", () => {
    const splits = computePercentageSplits(
      1000,
      [
        { memberId: alice.id, percentage: 33.33 },
        { memberId: bob.id, percentage: 33.33 },
        { memberId: cara.id, percentage: 33.34 },
      ],
      members
    );
    expect(sum(splits)).toBe(1000);
  });

  it("allocates nothing to a member on 0%", () => {
    const splits = computePercentageSplits(
      5000,
      [
        { memberId: alice.id, percentage: 100 },
        { memberId: bob.id, percentage: 0 },
      ],
      members
    );
    expect(byId(splits, alice.id)).toBe(5000);
    expect(byId(splits, bob.id)).toBe(0);
  });

  it("preserves the percentage alongside the computed amount", () => {
    const splits = computePercentageSplits(
      2000,
      [{ memberId: alice.id, percentage: 100 }],
      members
    );
    expect(splits[0].percentage).toBe(100);
  });
});

describe("validateSplits", () => {
  it("rejects an empty participant list", () => {
    expect(validateSplits("equal", 1000, [], members).valid).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    const splits = [{ memberId: alice.id }];
    expect(validateSplits("equal", 0, splits, members).valid).toBe(false);
    expect(validateSplits("equal", -500, splits, members).valid).toBe(false);
  });

  it("accepts any equal split with participants and a positive amount", () => {
    expect(validateSplits("equal", 1000, [{ memberId: alice.id }], members).valid).toBe(true);
  });

  it("rejects percentages that do not sum to 100", () => {
    const result = validateSplits(
      "percentage",
      1000,
      [
        { memberId: alice.id, percentage: 50 },
        { memberId: bob.id, percentage: 30 },
      ],
      members
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("100%");
  });

  it("accepts percentages that sum to 100 with decimals", () => {
    expect(
      validateSplits(
        "percentage",
        1000,
        [
          { memberId: alice.id, percentage: 33.33 },
          { memberId: bob.id, percentage: 33.33 },
          { memberId: cara.id, percentage: 33.34 },
        ],
        members
      ).valid
    ).toBe(true);
  });

  it("rejects exact splits that do not add up to the total", () => {
    const result = validateSplits(
      "exact",
      1000,
      [
        { memberId: alice.id, amountMinor: 400 },
        { memberId: bob.id, amountMinor: 500 },
      ],
      members
    );
    expect(result.valid).toBe(false);
  });

  it("accepts exact splits that add up to the total", () => {
    expect(
      validateSplits(
        "exact",
        1000,
        [
          { memberId: alice.id, amountMinor: 400 },
          { memberId: bob.id, amountMinor: 600 },
        ],
        members
      ).valid
    ).toBe(true);
  });
});

describe("resolveSplitAmounts", () => {
  it("resolves equal splits at read time", () => {
    const shares = resolveSplitAmounts(
      "equal",
      1000,
      [{ memberId: alice.id }, { memberId: bob.id }, { memberId: cara.id }],
      members
    );
    expect(shares[alice.id]).toBe(334);
    expect(shares[bob.id]).toBe(333);
    expect(shares[cara.id]).toBe(333);
  });

  it("resolves percentage splits", () => {
    const shares = resolveSplitAmounts(
      "percentage",
      10000,
      [
        { memberId: alice.id, percentage: 70 },
        { memberId: bob.id, percentage: 30 },
      ],
      members
    );
    expect(shares[alice.id]).toBe(7000);
    expect(shares[bob.id]).toBe(3000);
  });

  it("passes exact splits straight through", () => {
    const shares = resolveSplitAmounts(
      "exact",
      1000,
      [
        { memberId: alice.id, amountMinor: 250 },
        { memberId: bob.id, amountMinor: 750 },
      ],
      members
    );
    expect(shares[alice.id]).toBe(250);
    expect(shares[bob.id]).toBe(750);
  });
});
