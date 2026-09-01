import { resolveSplitAmounts } from "./splitCalc";
import type {
  BalanceResult,
  Currency,
  Expense,
  Member,
  Settlement,
  SettlementPlan,
} from "./types";

/**
 * Net balance per member, in minor units.
 * net = paid - owed + settlementsReceived - settlementsSent
 * Positive means the group owes them; negative means they owe the group.
 */
export function computeNets(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[]
): Record<string, number> {
  const nets: Record<string, number> = {};
  for (const m of members) nets[m.id] = 0;

  for (const expense of expenses) {
    if (nets[expense.paidBy] === undefined) nets[expense.paidBy] = 0;
    nets[expense.paidBy] += expense.amountMinor;

    const shares = resolveSplitAmounts(
      expense.splitType,
      expense.amountMinor,
      expense.splits,
      members
    );
    for (const [memberId, share] of Object.entries(shares)) {
      if (nets[memberId] === undefined) nets[memberId] = 0;
      nets[memberId] -= share;
    }
  }

  for (const s of settlements) {
    if (nets[s.fromMemberId] === undefined) nets[s.fromMemberId] = 0;
    if (nets[s.toMemberId] === undefined) nets[s.toMemberId] = 0;
    // Paying down a debt moves the payer's net up toward zero.
    nets[s.fromMemberId] += s.amountMinor;
    nets[s.toMemberId] -= s.amountMinor;
  }

  return nets;
}

/**
 * Greedy creditor-debtor matching. Produces a small (not provably minimal —
 * that problem is NP-hard) set of transactions that clears every balance.
 */
export function simplifyDebts(nets: Record<string, number>): SettlementPlan[] {
  const debtors = Object.entries(nets)
    .filter(([, amount]) => amount < 0)
    .map(([memberId, amount]) => ({ memberId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));

  const creditors = Object.entries(nets)
    .filter(([, amount]) => amount > 0)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));

  const plan: SettlementPlan[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const payment = Math.min(debtors[i].amount, creditors[j].amount);
    if (payment > 0) {
      plan.push({
        fromMemberId: debtors[i].memberId,
        toMemberId: creditors[j].memberId,
        amountMinor: payment,
      });
    }
    debtors[i].amount -= payment;
    creditors[j].amount -= payment;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return plan;
}

export function computeBalances(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[]
): BalanceResult {
  const nets = computeNets(members, expenses, settlements);

  const currencySet = new Set<Currency>();
  for (const e of expenses) currencySet.add(e.currency);
  const currencies = [...currencySet];

  return {
    nets,
    transactions: simplifyDebts(nets),
    mixedCurrencies: currencies.length > 1,
    currencies,
  };
}
