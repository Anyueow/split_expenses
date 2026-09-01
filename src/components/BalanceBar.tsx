import { Avatar } from "./Avatar";
import { formatMoneySigned } from "../lib/format";
import type { Currency, Member } from "../lib/types";

/**
 * Diverging bar: the track's midpoint is zero, green grows right (owed money),
 * red grows left (owes money). Widths are scaled against the largest absolute
 * net in the group so the biggest bar always fills half the track.
 */
export function BalanceBar({
  member,
  amountMinor,
  maxAbsMinor,
  currency,
}: {
  member: Member;
  amountMinor: number;
  maxAbsMinor: number;
  currency: Currency;
}) {
  const scale = maxAbsMinor > 0 ? Math.abs(amountMinor) / maxAbsMinor : 0;
  const widthPct = Math.max(scale * 50, Math.abs(amountMinor) > 0 ? 2 : 0);
  const positive = amountMinor > 0;
  const settled = amountMinor === 0;

  return (
    <li className="py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar member={member} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
          {member.name}
        </span>
        <span
          className={`amount text-sm ${
            settled ? "text-neutral-500" : positive ? "text-success" : "text-danger"
          }`}
        >
          {settled ? "settled up" : formatMoneySigned(amountMinor, currency)}
        </span>
      </div>

      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-neutral-100"
        role="img"
        aria-label={`${member.name}: ${
          settled
            ? "settled up"
            : positive
              ? `owed ${formatMoneySigned(amountMinor, currency)}`
              : `owes ${formatMoneySigned(amountMinor, currency)}`
        }`}
      >
        <span
          aria-hidden
          className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#DEDEEA]"
        />
        {!settled && (
          <span
            aria-hidden
            className={`animate-grow-x absolute top-0 h-full ${
              positive
                ? "left-1/2 origin-left rounded-r-full bg-success"
                : "right-1/2 origin-right rounded-l-full bg-danger"
            }`}
            style={{ width: `${widthPct}%` }}
          />
        )}
      </div>
    </li>
  );
}
