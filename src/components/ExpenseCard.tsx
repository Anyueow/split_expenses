import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { formatDate, formatMoney } from "../lib/format";
import { resolveSplitAmounts } from "../lib/splitCalc";
import { CATEGORY_EMOJI, type Expense, type Member } from "../lib/types";

export function ExpenseCard({
  expense,
  members,
  onEdit,
  onDelete,
  deleting = false,
  index = 0,
}: {
  expense: Expense;
  members: Member[];
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
  index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(members.map((m) => [m.id, m]));
  const payer = byId.get(expense.paidBy);
  const shares = resolveSplitAmounts(
    expense.splitType,
    expense.amountMinor,
    expense.splits,
    members
  );
  const shareEntries = Object.entries(shares);

  return (
    <li
      className={`card overflow-hidden ${deleting ? "animate-fade-out" : "animate-slide-up"}`}
      style={deleting ? undefined : { animationDelay: `${Math.min(index, 8) * 25}ms` }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-lg"
        >
          {CATEGORY_EMOJI[expense.category]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-semibold text-neutral-900">
              {expense.description}
            </span>
            <span className="amount shrink-0 text-base text-neutral-900">
              {formatMoney(expense.amountMinor, expense.currency)}
            </span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <Avatar member={payer} size="sm" className="h-4 w-4 text-[8px]" />
            <span className="truncate">{payer?.name ?? "Unknown"} paid</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{formatDate(expense.date)}</span>
          </span>
        </span>

        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="animate-fade-in border-t border-neutral-100 px-4 pb-3 pt-3">
          <p className="label mb-2">
            Split {expense.splitType === "equal" ? "equally" : `by ${expense.splitType}`}
          </p>
          <ul className="space-y-1.5">
            {shareEntries.map(([memberId, amountMinor]) => {
              const member = byId.get(memberId);
              return (
                <li key={memberId} className="flex items-center gap-2 text-sm">
                  <Avatar member={member} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-neutral-900">
                    {member?.name ?? "Removed member"}
                  </span>
                  <span className="amount text-sm text-neutral-500">
                    {formatMoney(amountMinor, expense.currency)}
                  </span>
                </li>
              );
            })}
          </ul>

          {expense.note && (
            <p className="mt-3 rounded-xl bg-neutral-100 p-3 text-sm leading-relaxed text-neutral-500">
              {expense.note}
            </p>
          )}

          <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
            <button
              type="button"
              onClick={onEdit}
              className="btn-secondary flex-1 py-2 text-sm"
            >
              <Pencil aria-hidden className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost flex-1 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
