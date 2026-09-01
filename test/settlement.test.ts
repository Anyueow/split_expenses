import { describe, expect, it } from "vitest";
import { computeBalances, computeNets, simplifyDebts } from "../src/lib/settlement";
import type { Expense, Member, Settlement, Split, SplitType } from "../src/lib/types";

const alice: Member = { id: "m-alice", name: "Alice", color: "#6C5CE7" };
const bob: Member = { id: "m-bob", name: "Bob", color: "#00B894" };
const cara: Member = { id: "m-cara", name: "Cara", color: "#E17055" };
const dan: Member = { id: "m-dan", name: "Dan", color: "#0984E3" };
const eve: Member = { id: "m-eve", name: "Eve", color: "#FDCB6E" };

let seq = 0;

function expense(
  paidBy: string,
  amountMinor: number,
  participants: string[],
  opts: { splitType?: SplitType; splits?: Split[]; currency?: Expense["currency"] } = {}
): Expense {
  seq++;
  return {
    id: `e${seq}`,
    groupId: "g1",
    description: `Expense ${seq}`,
    amountMinor,
    currency: opts.currency ?? "EUR",
    paidBy,
    splitType: opts.splitType ?? "equal",
    splits: opts.splits ?? participants.map((memberId) => ({ memberId })),
    category: "food",
    date: "2026-04-01",
    createdAt: "2026-04-01T10:00:00.000Z",
    updatedAt: "2026-04-01T10:00:00.000Z",
  };
}

function settlement(from: string, to: string, amountMinor: number): Settlement {
  seq++;
  return {
    id: `s${seq}`,
    groupId: "g1",
    fromMemberId: from,
    toMemberId: to,
    amountMinor,
    currency: "EUR",
    date: "2026-04-02",
    createdAt: "2026-04-02T10:00:00.000Z",
  };
}

const netsSum = (nets: Record<string, number>) =>
  Object.values(nets).reduce((a, b) => a + b, 0);

describe("computeNets", () => {
  it("credits the payer and debits each participant's share", () => {
    const members = [alice, bob, cara];
    const nets = computeNets(members, [expense(alice.id, 3000, [alice.id, bob.id, cara.id])], []);
    expect(nets[alice.id]).toBe(2000);
    expect(nets[bob.id]).toBe(-1000);
    expect(nets[cara.id]).toBe(-1000);
    expect(netsSum(nets)).toBe(0);
  });

  it("leaves everyone at zero when a payer covers only themselves", () => {
    const members = [alice, bob];
    const nets = computeNets(members, [expense(alice.id, 1500, [alice.id])], []);
    expect(nets[alice.id]).toBe(0);
    expect(nets[bob.id]).toBe(0);
  });

  it("sums to zero with an indivisible amount", () => {
    const members = [alice, bob, cara];
    const nets = computeNets(members, [expense(bob.id, 1000, [alice.id, bob.id, cara.id])], []);
    expect(netsSum(nets)).toBe(0);
    expect(nets[bob.id]).toBe(667); // paid 1000, owes 333
  });

  it("accumulates across several expenses with different payers", () => {
    const members = [alice, bob, cara];
    const all = [alice.id, bob.id, cara.id];
    const nets = computeNets(
      members,
      [expense(alice.id, 3000, all), expense(bob.id, 6000, all), expense(cara.id, 900, all)],
      []
    );
    expect(netsSum(nets)).toBe(0);
    expect(nets[alice.id]).toBe(3000 - 3300);
    expect(nets[bob.id]).toBe(6000 - 3300);
    expect(nets[cara.id]).toBe(900 - 3300);
  });

  it("applies exact and percentage splits", () => {
    const members = [alice, bob];
    const exact = expense(alice.id, 1000, [], {
      splitType: "exact",
      splits: [
        { memberId: alice.id, amountMinor: 200 },
        { memberId: bob.id, amountMinor: 800 },
      ],
    });
    const pct = expense(bob.id, 2000, [], {
      splitType: "percentage",
      splits: [
        { memberId: alice.id, percentage: 25 },
        { memberId: bob.id, percentage: 75 },
      ],
    });
    const nets = computeNets(members, [exact, pct], []);
    expect(nets[alice.id]).toBe(1000 - 200 - 500);
    expect(nets[bob.id]).toBe(2000 - 800 - 1500);
    expect(netsSum(nets)).toBe(0);
  });

  it("offsets balances when a settlement is recorded", () => {
    const members = [alice, bob];
    const expenses = [expense(alice.id, 2000, [alice.id, bob.id])];
    const before = computeNets(members, expenses, []);
    expect(before[bob.id]).toBe(-1000);

    const after = computeNets(members, expenses, [settlement(bob.id, alice.id, 1000)]);
    expect(after[bob.id]).toBe(0);
    expect(after[alice.id]).toBe(0);
    expect(netsSum(after)).toBe(0);
  });

  it("leaves a remainder when a settlement only partly covers the debt", () => {
    const members = [alice, bob];
    const nets = computeNets(
      members,
      [expense(alice.id, 2000, [alice.id, bob.id])],
      [settlement(bob.id, alice.id, 400)]
    );
    expect(nets[bob.id]).toBe(-600);
    expect(nets[alice.id]).toBe(600);
  });

  it("starts every member at zero even with no activity", () => {
    const nets = computeNets([alice, bob, cara], [], []);
    expect(nets).toEqual({ [alice.id]: 0, [bob.id]: 0, [cara.id]: 0 });
  });
});

describe("simplifyDebts", () => {
  it("returns nothing when everyone is square", () => {
    expect(simplifyDebts({ [alice.id]: 0, [bob.id]: 0 })).toEqual([]);
  });

  it("emits a single transaction for one debtor and one creditor", () => {
    const plan = simplifyDebts({ [alice.id]: 1000, [bob.id]: -1000 });
    expect(plan).toEqual([
      { fromMemberId: bob.id, toMemberId: alice.id, amountMinor: 1000 },
    ]);
  });

  it("clears every balance for three members", () => {
    const nets = { [alice.id]: 2000, [bob.id]: -1000, [cara.id]: -1000 };
    const plan = simplifyDebts(nets);
    expect(plan).toHaveLength(2);
    expectPlanClearsNets(nets, plan);
  });

  it("clears every balance for four members", () => {
    const nets = { [alice.id]: 5000, [bob.id]: 1500, [cara.id]: -4000, [dan.id]: -2500 };
    expectPlanClearsNets(nets, simplifyDebts(nets));
  });

  it("clears every balance for five members", () => {
    const nets = {
      [alice.id]: 12000,
      [bob.id]: -3000,
      [cara.id]: -4500,
      [dan.id]: 500,
      [eve.id]: -5000,
    };
    expectPlanClearsNets(nets, simplifyDebts(nets));
  });

  it("uses at most (members - 1) transactions", () => {
    const nets = {
      [alice.id]: 5000,
      [bob.id]: 1500,
      [cara.id]: -4000,
      [dan.id]: -2500,
      [eve.id]: 0,
    };
    expect(simplifyDebts(nets).length).toBeLessThanOrEqual(Object.keys(nets).length - 1);
  });

  it("never emits a zero-value transaction", () => {
    const plan = simplifyDebts({ [alice.id]: 1000, [bob.id]: -1000, [cara.id]: 0 });
    expect(plan.every((t) => t.amountMinor > 0)).toBe(true);
  });
});

/** Applying the plan to the nets must leave every member at exactly zero. */
function expectPlanClearsNets(
  nets: Record<string, number>,
  plan: { fromMemberId: string; toMemberId: string; amountMinor: number }[]
) {
  const working = { ...nets };
  for (const t of plan) {
    working[t.fromMemberId] += t.amountMinor;
    working[t.toMemberId] -= t.amountMinor;
  }
  for (const [memberId, net] of Object.entries(working)) {
    expect(`${memberId}:${net}`).toBe(`${memberId}:0`);
  }
}

describe("computeBalances", () => {
  it("reports a single currency as unmixed", () => {
    const result = computeBalances(
      [alice, bob],
      [expense(alice.id, 2000, [alice.id, bob.id])],
      []
    );
    expect(result.mixedCurrencies).toBe(false);
    expect(result.currencies).toEqual(["EUR"]);
  });

  it("flags mixed currencies when expenses disagree", () => {
    const result = computeBalances(
      [alice, bob],
      [
        expense(alice.id, 2000, [alice.id, bob.id], { currency: "EUR" }),
        expense(bob.id, 500000, [alice.id, bob.id], { currency: "HUF" }),
      ],
      []
    );
    expect(result.mixedCurrencies).toBe(true);
    expect(result.currencies).toEqual(expect.arrayContaining(["EUR", "HUF"]));
  });

  it("produces a plan that settles the group end to end", () => {
    const members = [alice, bob, cara, dan];
    const all = members.map((m) => m.id);
    const expenses = [
      expense(alice.id, 12000, all),
      expense(bob.id, 4500, [bob.id, cara.id]),
      expense(cara.id, 999, all),
      expense(dan.id, 7000, [alice.id, dan.id]),
    ];
    const result = computeBalances(members, expenses, []);
    expect(netsSum(result.nets)).toBe(0);
    expectPlanClearsNets(result.nets, result.transactions);
  });

  it("shows nothing left to settle once the plan is recorded", () => {
    const members = [alice, bob, cara];
    const expenses = [expense(alice.id, 3000, members.map((m) => m.id))];
    const first = computeBalances(members, expenses, []);

    const recorded: Settlement[] = first.transactions.map((t) =>
      settlement(t.fromMemberId, t.toMemberId, t.amountMinor)
    );
    const after = computeBalances(members, expenses, recorded);
    expect(after.transactions).toEqual([]);
    expect(Object.values(after.nets).every((n) => n === 0)).toBe(true);
  });
});
