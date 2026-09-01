import { useEffect, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import {
  currencySymbol,
  formatDate,
  formatMoney,
  minorToInput,
  parseAmountToMinor,
  todayIso,
} from "../lib/format";
import type { Currency, Member, Settlement, SettlementPlan } from "../lib/types";

export function SettlementRow({
  plan,
  members,
  currency,
  onSettle,
}: {
  plan: SettlementPlan;
  members: Member[];
  currency: Currency;
  onSettle: (payload: { amountMinor: number; date: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(members.map((m) => [m.id, m]));
  const from = byId.get(plan.fromMemberId);
  const to = byId.get(plan.toMemberId);

  return (
    <li className="card animate-slide-up p-4">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar member={from} size="sm" />
          <span className="truncate text-sm font-medium text-neutral-900">
            {from?.name ?? "Unknown"}
          </span>
          <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <Avatar member={to} size="sm" />
          <span className="truncate text-sm font-medium text-neutral-900">
            {to?.name ?? "Unknown"}
          </span>
        </span>
        <span className="amount shrink-0 text-base text-neutral-900">
          {formatMoney(plan.amountMinor, currency)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary mt-3 w-full py-2 text-sm text-primary"
      >
        Mark as paid
      </button>

      <SettleUpDialog
        open={open}
        onClose={() => setOpen(false)}
        fromName={from?.name ?? "Unknown"}
        toName={to?.name ?? "Unknown"}
        currency={currency}
        defaultAmountMinor={plan.amountMinor}
        onConfirm={onSettle}
      />
    </li>
  );
}

function SettleUpDialog({
  open,
  onClose,
  fromName,
  toName,
  currency,
  defaultAmountMinor,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  fromName: string;
  toName: string;
  currency: Currency;
  defaultAmountMinor: number;
  onConfirm: (payload: { amountMinor: number; date: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() => minorToInput(defaultAmountMinor));
  const [date, setDate] = useState(todayIso);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(minorToInput(defaultAmountMinor));
      setDate(todayIso());
      setDone(false);
      setError(null);
    }
  }, [open, defaultAmountMinor]);

  const amountMinor = parseAmountToMinor(amount, currency);

  async function confirm() {
    if (busy || amountMinor <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ amountMinor, date });
      setDone(true);
      // Let the checkmark animation play before the list re-renders underneath.
      window.setTimeout(onClose, 850);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that payment.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={done ? undefined : "Record payment"}
      labelledBy="settle-title"
    >
      {done ? (
        <div className="flex flex-col items-center py-6">
          <span className="animate-pop-in flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
              <path
                d="M8 16.5l5.5 5.5L24 11"
                fill="none"
                stroke="#00B894"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="check-path"
              />
            </svg>
          </span>
          <p className="mt-4 font-semibold text-neutral-900">Payment recorded</p>
          <p className="mt-1 text-sm text-neutral-500">
            {fromName} paid {toName} {formatMoney(amountMinor, currency)}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm leading-relaxed text-neutral-500">
            <span className="font-medium text-neutral-900">{fromName}</span> pays{" "}
            <span className="font-medium text-neutral-900">{toName}</span>. Adjust the
            amount if they settled a different sum.
          </p>

          <label htmlFor="settle-amount" className="label">
            Amount
          </label>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-neutral-500"
            >
              {currencySymbol(currency)}
            </span>
            <input
              id="settle-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="field amount pl-10 text-lg"
            />
          </div>

          <label htmlFor="settle-date" className="label mt-4">
            Date
          </label>
          <input
            id="settle-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={confirm}
              disabled={busy || amountMinor <= 0}
            >
              {busy ? <Spinner className="h-4 w-4" /> : "Confirm"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function RecordedSettlementRow({
  settlement,
  members,
  onDelete,
  deleting = false,
}: {
  settlement: Settlement;
  members: Member[];
  onDelete: () => void;
  deleting?: boolean;
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const from = byId.get(settlement.fromMemberId);
  const to = byId.get(settlement.toMemberId);

  return (
    <li
      className={`flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 ${
        deleting ? "animate-fade-out" : ""
      }`}
    >
      <Avatar member={from} size="sm" />
      <ArrowRight aria-hidden className="h-3 w-3 shrink-0 text-neutral-500" />
      <Avatar member={to} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">
        {from?.name ?? "Unknown"} → {to?.name ?? "Unknown"}
        <span aria-hidden> · </span>
        {formatDate(settlement.date)}
      </span>
      <span className="amount shrink-0 text-sm text-neutral-900">
        {formatMoney(settlement.amountMinor, settlement.currency)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete this payment"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}
