import { useCallback, useEffect, useState } from "react";
import { Info } from "lucide-react";
import { BalanceBar } from "./BalanceBar";
import { RecordedSettlementRow, SettlementRow } from "./SettlementRow";
import { EmptyState } from "./EmptyState";
import { ConfirmDialog } from "./Modal";
import { ErrorBlock, LoadingBlock } from "./Spinner";
import * as api from "../lib/api";
import { formatMoney, todayIso } from "../lib/format";
import type { Group, Member, Settlement } from "../lib/types";

export function BalancesTab({
  group,
  settlements,
  onChanged,
}: {
  group: Group;
  settlements: Settlement[];
  onChanged: () => Promise<void> | void;
}) {
  const [data, setData] = useState<api.BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Settlement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.getBalances(group.id));
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setError(err instanceof Error ? err.message : "Couldn't load balances.");
    } finally {
      setLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function settle(
    fromMemberId: string,
    toMemberId: string,
    payload: { amountMinor: number; date: string }
  ) {
    await api.createSettlement(group.id, {
      fromMemberId,
      toMemberId,
      amountMinor: payload.amountMinor,
      currency: group.currency,
      date: payload.date || todayIso(),
    });
    await Promise.all([load(), onChanged()]);
  }

  async function confirmDeleteSettlement() {
    const settlement = pendingDelete;
    if (!settlement) return;
    setPendingDelete(null);
    setDeletingId(settlement.id);
    setActionError(null);
    try {
      await api.deleteSettlement(group.id, settlement.id);
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setActionError(err instanceof Error ? err.message : "Couldn't delete that payment.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingBlock label="Working out balances…" />;
  if (error || !data) {
    return <ErrorBlock message={error ?? "Couldn't load balances."} onRetry={() => void load()} />;
  }

  // The balances endpoint returns members too; prefer it so a member added on
  // another device still resolves here.
  const members: Member[] = data.members?.length ? data.members : group.members;
  const nets = data.nets ?? {};
  const maxAbs = Math.max(0, ...members.map((m) => Math.abs(nets[m.id] ?? 0)));
  const transactions = data.transactions ?? [];
  const allSettled = transactions.length === 0;

  return (
    <div className="space-y-6">
      {data.mixedCurrencies && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-primary-light p-4 text-sm leading-relaxed text-primary">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Balances are shown in each expense&rsquo;s original currency. Convert manually
            or settle per currency.
            {data.currencies?.length > 0 && (
              <span className="mt-1 block text-xs opacity-80">
                In use: {data.currencies.join(", ")}
              </span>
            )}
          </span>
        </p>
      )}

      <section>
        <h2 className="label">Net balances</h2>
        <ul className="card divide-y divide-neutral-100 px-4 py-1">
          {members.map((member) => (
            <BalanceBar
              key={member.id}
              member={member}
              amountMinor={nets[member.id] ?? 0}
              maxAbsMinor={maxAbs}
              currency={group.currency}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="label">Settle up</h2>
        {allSettled ? (
          <div className="card">
            <EmptyState
              emoji="🎉"
              title="All settled up"
              description="Nobody owes anybody anything right now."
            />
          </div>
        ) : (
          <ul className="space-y-3">
            {transactions.map((plan) => (
              <SettlementRow
                key={`${plan.fromMemberId}-${plan.toMemberId}-${plan.amountMinor}`}
                plan={plan}
                members={members}
                currency={group.currency}
                onSettle={(payload) =>
                  settle(plan.fromMemberId, plan.toMemberId, payload)
                }
              />
            ))}
          </ul>
        )}
      </section>

      {settlements.length > 0 && (
        <section>
          <h2 className="label">Recorded payments</h2>
          {actionError && (
            <p role="alert" className="mb-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {actionError}
            </p>
          )}
          <ul className="card divide-y divide-neutral-100 p-1">
            {settlements.map((settlement) => (
              <RecordedSettlementRow
                key={settlement.id}
                settlement={settlement}
                members={members}
                deleting={deletingId === settlement.id}
                onDelete={() => setPendingDelete(settlement)}
              />
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete payment?"
        message={
          pendingDelete
            ? `This ${formatMoney(
                pendingDelete.amountMinor,
                pendingDelete.currency
              )} payment will be removed and the debt will reappear.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDeleteSettlement()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
