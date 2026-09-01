import { Avatar } from "./Avatar";
import { currencySymbol, formatMoney, parseAmountToMinor } from "../lib/format";
import { computeEqualSplits } from "../lib/splitCalc";
import type { Currency, Member, SplitType } from "../lib/types";

const SPLIT_TYPES: Array<{ value: SplitType; label: string }> = [
  { value: "equal", label: "Equal" },
  { value: "percentage", label: "%" },
  { value: "exact", label: "Exact" },
];

export function SplitInput({
  splitType,
  onSplitTypeChange,
  participants,
  allMembers,
  amountMinor,
  currency,
  percentages,
  onPercentageChange,
  exactAmounts,
  onExactAmountChange,
  error,
}: {
  splitType: SplitType;
  onSplitTypeChange: (type: SplitType) => void;
  participants: Member[];
  allMembers: Member[];
  amountMinor: number;
  currency: Currency;
  percentages: Record<string, string>;
  onPercentageChange: (memberId: string, value: string) => void;
  exactAmounts: Record<string, string>;
  onExactAmountChange: (memberId: string, value: string) => void;
  error?: string | null;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="label mb-0">Split</span>
        <div
          role="radiogroup"
          aria-label="Split type"
          className="flex rounded-xl bg-neutral-100 p-1"
        >
          {SPLIT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={splitType === option.value}
              onClick={() => onSplitTypeChange(option.value)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ${
                splitType === option.value
                  ? "bg-white text-primary shadow-sm"
                  : "text-neutral-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {participants.length === 0 ? (
        <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-500">
          Pick at least one person to split between.
        </p>
      ) : splitType === "equal" ? (
        <EqualPreview
          participants={participants}
          allMembers={allMembers}
          amountMinor={amountMinor}
          currency={currency}
        />
      ) : splitType === "percentage" ? (
        <PercentageInputs
          participants={participants}
          amountMinor={amountMinor}
          currency={currency}
          percentages={percentages}
          onChange={onPercentageChange}
        />
      ) : (
        <ExactInputs
          participants={participants}
          amountMinor={amountMinor}
          currency={currency}
          exactAmounts={exactAmounts}
          onChange={onExactAmountChange}
        />
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function EqualPreview({
  participants,
  allMembers,
  amountMinor,
  currency,
}: {
  participants: Member[];
  allMembers: Member[];
  amountMinor: number;
  currency: Currency;
}) {
  const splits = computeEqualSplits(
    amountMinor,
    participants.map((m) => m.id),
    allMembers
  );
  const shares = splits.map((s) => s.amountMinor ?? 0);
  const min = Math.min(...shares);
  const max = Math.max(...shares);

  return (
    <div className="rounded-xl bg-primary-light p-4 text-center">
      <p className="amount text-xl text-primary">
        {min === max
          ? formatMoney(min, currency)
          : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`}
      </p>
      <p className="mt-1 text-sm text-primary/70">
        each · {participants.length} {participants.length === 1 ? "person" : "people"}
      </p>
      {min !== max && (
        <p className="mt-2 text-xs text-primary/70">
          The total doesn&rsquo;t divide evenly, so the leftover is spread a cent at a
          time.
        </p>
      )}
    </div>
  );
}

function PercentageInputs({
  participants,
  amountMinor,
  currency,
  percentages,
  onChange,
}: {
  participants: Member[];
  amountMinor: number;
  currency: Currency;
  percentages: Record<string, string>;
  onChange: (memberId: string, value: string) => void;
}) {
  const total = participants.reduce(
    (sum, m) => sum + (Number.parseFloat(percentages[m.id] ?? "") || 0),
    0
  );
  const balanced = Math.round(total * 100) === 10000;
  const remaining = 100 - total;

  return (
    <div className="space-y-2">
      {participants.map((member) => {
        const pct = Number.parseFloat(percentages[member.id] ?? "") || 0;
        return (
          <div key={member.id} className="flex items-center gap-3">
            <Avatar member={member} size="sm" />
            <label htmlFor={`pct-${member.id}`} className="min-w-0 flex-1 truncate text-sm">
              {member.name}
            </label>
            <span className="amount w-20 text-right text-xs text-neutral-500">
              {formatMoney(Math.round((amountMinor * pct) / 100), currency)}
            </span>
            <div className="relative w-24">
              <input
                id={`pct-${member.id}`}
                type="text"
                inputMode="decimal"
                value={percentages[member.id] ?? ""}
                onChange={(e) => onChange(member.id, e.target.value)}
                placeholder="0"
                className="field amount py-2 pr-7 text-right text-sm"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
              >
                %
              </span>
            </div>
          </div>
        );
      })}

      <RunningTotal
        balanced={balanced}
        left="Total"
        right={`${total.toFixed(total % 1 === 0 ? 0 : 1)}%`}
        hint={
          balanced
            ? "Adds up to 100%"
            : `${remaining > 0 ? remaining.toFixed(1) : Math.abs(remaining).toFixed(1)}% ${
                remaining > 0 ? "remaining" : "over"
              }`
        }
      />
    </div>
  );
}

function ExactInputs({
  participants,
  amountMinor,
  currency,
  exactAmounts,
  onChange,
}: {
  participants: Member[];
  amountMinor: number;
  currency: Currency;
  exactAmounts: Record<string, string>;
  onChange: (memberId: string, value: string) => void;
}) {
  const total = participants.reduce(
    (sum, m) => sum + parseAmountToMinor(exactAmounts[m.id] ?? "", currency),
    0
  );
  const balanced = total === amountMinor;
  const difference = amountMinor - total;

  return (
    <div className="space-y-2">
      {participants.map((member) => (
        <div key={member.id} className="flex items-center gap-3">
          <Avatar member={member} size="sm" />
          <label
            htmlFor={`exact-${member.id}`}
            className="min-w-0 flex-1 truncate text-sm"
          >
            {member.name}
          </label>
          <div className="relative w-32">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
            >
              {currencySymbol(currency)}
            </span>
            <input
              id={`exact-${member.id}`}
              type="text"
              inputMode="decimal"
              value={exactAmounts[member.id] ?? ""}
              onChange={(e) => onChange(member.id, e.target.value)}
              placeholder="0.00"
              className="field amount py-2 pl-9 text-right text-sm"
            />
          </div>
        </div>
      ))}

      <RunningTotal
        balanced={balanced}
        left="Total"
        right={`${formatMoney(total, currency)} / ${formatMoney(amountMinor, currency)}`}
        hint={
          balanced
            ? "Matches the expense total"
            : `${formatMoney(Math.abs(difference), currency)} ${
                difference > 0 ? "left to assign" : "over"
              }`
        }
      />
    </div>
  );
}

function RunningTotal({
  balanced,
  left,
  right,
  hint,
}: {
  balanced: boolean;
  left: string;
  right: string;
  hint: string;
}) {
  return (
    <div
      aria-live="polite"
      className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 ${
        balanced ? "bg-success/10" : "bg-danger/10"
      }`}
    >
      <span
        className={`text-sm font-semibold ${balanced ? "text-success" : "text-danger"}`}
      >
        {left}
      </span>
      <span className="text-right">
        <span
          className={`amount block text-sm ${balanced ? "text-success" : "text-danger"}`}
        >
          {right}
        </span>
        <span
          className={`block text-xs ${balanced ? "text-success/80" : "text-danger/80"}`}
        >
          {hint}
        </span>
      </span>
    </div>
  );
}
