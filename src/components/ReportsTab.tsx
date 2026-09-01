import { useMemo, useState } from "react";
import { ArrowRight, Download, Info } from "lucide-react";
import { Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import * as api from "../lib/api";
import { formatDate, formatMoney, formatMoneySigned } from "../lib/format";
import { resolveSplitAmounts } from "../lib/splitCalc";
import { computeBalances } from "../lib/settlement";
import type { Expense, Group, Settlement } from "../lib/types";

/**
 * Chart colours come from a validated categorical palette rather than from the
 * stored member colours: those include a purple/blue pair only ΔE 11.5 apart in
 * normal vision (4.0 under deuteranopia), well below the legibility floor for
 * adjacent marks. Every series here is either a single hue (magnitude) or a
 * labelled two-series pair, so identity never rests on colour alone.
 */
const SERIES_PAID = "#2a78d6";
const SERIES_SHARE = "#eb6834";
const SERIES_SPEND = "#6C5CE7";

function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function ReportsTab({
  group,
  expenses,
  settlements,
}: {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
}) {
  const [downloadFor, setDownloadFor] = useState<string>("all");
  const [showTable, setShowTable] = useState(false);

  const inGroupCurrency = useMemo(
    () => expenses.filter((e) => e.currency === group.currency),
    [expenses, group.currency]
  );

  // Per-member paid vs share, via the same split resolver the balances use.
  const perMember = useMemo(() => {
    const paid = new Map<string, number>();
    const share = new Map<string, number>();
    for (const m of group.members) {
      paid.set(m.id, 0);
      share.set(m.id, 0);
    }
    for (const e of inGroupCurrency) {
      paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + e.amountMinor);
      const shares = resolveSplitAmounts(e.splitType, e.amountMinor, e.splits, group.members);
      for (const [id, amt] of Object.entries(shares)) {
        share.set(id, (share.get(id) ?? 0) + amt);
      }
    }
    return group.members.map((m) => ({
      member: m,
      paid: paid.get(m.id) ?? 0,
      share: share.get(m.id) ?? 0,
    }));
  }, [group.members, inGroupCurrency]);

  const byDay = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of inGroupCurrency) {
      totals.set(e.date, (totals.get(e.date) ?? 0) + e.amountMinor);
    }
    return [...totals.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, total]) => ({ date, total }));
  }, [inGroupCurrency]);

  const balances = useMemo(
    () => computeBalances(group.members, expenses, settlements),
    [group.members, expenses, settlements]
  );

  const nameById = useMemo(
    () => new Map(group.members.map((m) => [m.id, m])),
    [group.members]
  );

  if (expenses.length === 0) {
    return (
      <EmptyState
        emoji="📊"
        title="No reports yet"
        description="Add a few expenses and the charts will fill in."
      />
    );
  }

  const total = inGroupCurrency.reduce((s, e) => s + e.amountMinor, 0);
  const busiest = byDay.reduce((a, b) => (b.total > a.total ? b : a), byDay[0]);
  const maxDay = Math.max(...byDay.map((d) => d.total), 1);
  const maxPerson = Math.max(...perMember.flatMap((p) => [p.paid, p.share]), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spend" value={formatMoney(total, group.currency)} />
        <Stat label="Expenses" value={String(expenses.length)} />
        <Stat
          label="Avg / expense"
          value={formatMoney(
            Math.round(total / Math.max(inGroupCurrency.length, 1)),
            group.currency
          )}
        />
        <Stat
          label="Busiest day"
          value={busiest ? shortDay(busiest.date) : "—"}
          sub={busiest ? formatMoney(busiest.total, group.currency) : undefined}
        />
      </div>

      <section className="card p-4">
        <h2 className="mb-1 text-base text-neutral-900">Spend by day</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Total charged each day, in {group.currency}.
        </p>
        <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 170 }}>
          {byDay.map((d) => {
            const h = Math.max(Math.round((d.total / maxDay) * 128), 3);
            return (
              <div
                key={d.date}
                className="group/bar flex min-w-[34px] flex-1 flex-col items-center justify-end gap-1.5"
              >
                <span className="amount whitespace-nowrap text-[10px] leading-none text-neutral-500">
                  {formatMoney(d.total, group.currency)}
                </span>
                <div
                  className="w-full rounded-t transition-opacity hover:opacity-80"
                  style={{ height: h, backgroundColor: SERIES_SPEND }}
                  role="img"
                  aria-label={`${formatDate(d.date)}: ${formatMoney(d.total, group.currency)}`}
                  title={`${formatDate(d.date)} — ${formatMoney(d.total, group.currency)}`}
                />
                <span className="text-[10px] leading-none text-neutral-500">
                  {shortDay(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-base text-neutral-900">Paid vs. share</h2>
        <p className="mb-3 text-xs text-neutral-500">
          What each person put on their card, against what the splits say they owe.
        </p>

        <div className="mb-4 flex flex-wrap gap-4 text-xs font-semibold text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SERIES_PAID }}
            />
            Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SERIES_SHARE }}
            />
            Their share
          </span>
        </div>

        <ul className="space-y-4">
          {perMember.map(({ member, paid, share }) => {
            const net = paid - share;
            return (
              <li key={member.id}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar member={member} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                    {member.name}
                  </span>
                  <span
                    className={`amount shrink-0 text-sm ${
                      net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-neutral-500"
                    }`}
                  >
                    {formatMoneySigned(net, group.currency)}
                  </span>
                </div>
                <div className="space-y-1">
                  <Bar
                    width={(paid / maxPerson) * 100}
                    color={SERIES_PAID}
                    label={formatMoney(paid, group.currency)}
                    title={`${member.name} paid ${formatMoney(paid, group.currency)}`}
                  />
                  <Bar
                    width={(share / maxPerson) * 100}
                    color={SERIES_SHARE}
                    label={formatMoney(share, group.currency)}
                    title={`${member.name} owes ${formatMoney(share, group.currency)}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-base text-neutral-900">Settling up</h2>
        <p className="mb-4 text-xs text-neutral-500">
          The fewest payments that clear every balance.
        </p>

        {balances.mixedCurrencies && (
          <p className="mb-3 flex gap-2 rounded-xl bg-primary-light p-3 text-xs text-neutral-500">
            <Info aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            This group has expenses in more than one currency, so settle per currency.
          </p>
        )}

        {balances.transactions.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">
            All settled up — nothing to pay. 🎉
          </p>
        ) : (
          <ul className="space-y-2">
            {balances.transactions.map((t, i) => {
              const from = nameById.get(t.fromMemberId);
              const to = nameById.get(t.toMemberId);
              return (
                <li
                  key={`${t.fromMemberId}-${t.toMemberId}-${i}`}
                  className="flex items-center gap-2 rounded-xl bg-neutral-100 p-3"
                >
                  <Avatar member={from} size="sm" />
                  <span className="min-w-0 max-w-[30%] truncate text-sm text-neutral-900">
                    {from?.name ?? "Unknown"}
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-500" />
                  <Avatar member={to} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
                    {to?.name ?? "Unknown"}
                  </span>
                  <span className="amount shrink-0 text-sm text-neutral-900">
                    {formatMoney(t.amountMinor, group.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Table view: the required relief for fills that sit under 3:1 contrast. */}
      <section className="card p-4">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="text-sm font-semibold text-primary"
        >
          {showTable ? "Hide" : "Show"} the numbers as a table
        </button>
        {showTable && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Person
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    Paid
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    Share
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {perMember.map(({ member, paid, share }) => (
                  <tr key={member.id} className="border-b border-neutral-100 last:border-0">
                    <th scope="row" className="py-2 pr-3 font-normal text-neutral-900">
                      {member.name}
                    </th>
                    <td className="amount py-2 pr-3 text-right text-neutral-900">
                      {formatMoney(paid, group.currency)}
                    </td>
                    <td className="amount py-2 pr-3 text-right text-neutral-900">
                      {formatMoney(share, group.currency)}
                    </td>
                    <td
                      className={`amount py-2 text-right ${
                        paid - share > 0
                          ? "text-success"
                          : paid - share < 0
                            ? "text-danger"
                            : "text-neutral-500"
                      }`}
                    >
                      {formatMoneySigned(paid - share, group.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-base text-neutral-900">Download</h2>
        <p className="mb-3 text-xs text-neutral-500">
          A CSV of every expense, with each person&rsquo;s share as its own column. Pick a
          person to get only the expenses they were part of, plus what they paid and owe.
        </p>
        <label htmlFor="csv-scope" className="label">
          Point of view
        </label>
        <select
          id="csv-scope"
          value={downloadFor}
          onChange={(e) => setDownloadFor(e.target.value)}
          className="mb-3 w-full rounded-xl border border-[#E9E9F2] bg-white px-3 py-2.5 text-base text-neutral-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">Everyone — the full group</option>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — just their expenses
            </option>
          ))}
        </select>
        <a
          href={api.exportCsvUrl(group.id, downloadFor === "all" ? undefined : downloadFor)}
          download
          className="btn-secondary w-full"
        >
          <Download aria-hidden className="h-4 w-4" />
          Download CSV
        </a>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <p className="label mb-1">{label}</p>
      <p className="amount text-lg leading-tight text-neutral-900">{value}</p>
      {sub && <p className="amount mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function Bar({
  width,
  color,
  label,
  title,
}: {
  width: number;
  color: string;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(width, 0.5)}%`, backgroundColor: color }}
        />
      </div>
      <span className="amount w-20 shrink-0 text-right text-xs text-neutral-500">{label}</span>
    </div>
  );
}
