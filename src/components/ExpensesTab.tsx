import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownWideNarrow, Plus, Search, X } from "lucide-react";
import { ExpenseCard } from "./ExpenseCard";
import { CategoryFilter } from "./CategoryPicker";
import { EmptyState } from "./EmptyState";
import { ConfirmDialog } from "./Modal";
import * as api from "../lib/api";
import { formatMoney } from "../lib/format";
import type { Category, Expense, Group } from "../lib/types";

const SORTS = [
  { id: "date-desc", label: "Newest first" },
  { id: "date-asc", label: "Oldest first" },
  { id: "amount-desc", label: "Highest amount" },
  { id: "amount-asc", label: "Lowest amount" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

export function ExpensesTab({
  group,
  expenses,
  onChanged,
  onExpensesChange,
}: {
  group: Group;
  expenses: Expense[];
  onChanged: () => Promise<void> | void;
  onExpensesChange: (expenses: Expense[]) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("date-desc");
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))],
    [expenses]
  );

  const memberName = useMemo(
    () => new Map(group.members.map((m) => [m.id, m.name.toLowerCase()])),
    [group.members]
  );

  // Matches description, note, payer name, category, and the formatted amount,
  // so "natalie", "coffee", "food" and "12.15" all find something.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filter !== "all" && e.category !== filter) return false;
      if (!q) return true;
      return (
        e.description.toLowerCase().includes(q) ||
        (e.note?.toLowerCase().includes(q) ?? false) ||
        (memberName.get(e.paidBy) ?? "").includes(q) ||
        e.category.includes(q) ||
        (e.amountMinor / 100).toFixed(2).includes(q)
      );
    });
  }, [expenses, filter, query, memberName]);

  const sorted = useMemo(() => {
    const list = [...visible];
    list.sort((a, b) => {
      switch (sort) {
        case "amount-desc":
          return b.amountMinor - a.amountMinor;
        case "amount-asc":
          return a.amountMinor - b.amountMinor;
        case "date-asc":
          return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        default:
          return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      }
    });
    return list;
  }, [visible, sort]);

  // Only meaningful when every expense shares the group currency; the balances
  // tab is where mixed-currency groups get the full story.
  const totalInGroupCurrency = useMemo(
    () =>
      expenses
        .filter((e) => e.currency === group.currency)
        .reduce((sum, e) => sum + e.amountMinor, 0),
    [expenses, group.currency]
  );

  async function confirmDelete() {
    const expense = pendingDelete;
    if (!expense) return;
    setPendingDelete(null);
    setDeletingId(expense.id);
    setError(null);
    try {
      await api.deleteExpense(group.id, expense.id);
      // Let the fade-out finish before the row leaves the list.
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      onExpensesChange(expenses.filter((e) => e.id !== expense.id));
      await onChanged();
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setError(err instanceof Error ? err.message : "Couldn't delete that expense.");
    } finally {
      setDeletingId(null);
    }
  }

  if (expenses.length === 0) {
    return (
      <EmptyState
        emoji="🧾"
        title="No expenses yet"
        description={`Add the first one — say who paid and how it splits between the ${group.members.length} of you, and the balances keep themselves up to date.`}
        action={
          <button
            type="button"
            onClick={() => navigate(`/groups/${group.id}/expenses/new`)}
            className="btn-primary px-5"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add expense
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="card mb-4 flex items-center justify-between p-4">
        <span className="text-sm text-neutral-500">
          {visible.length < expenses.length
            ? `${visible.length} of ${expenses.length} expenses`
            : `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}`}
        </span>
        <span className="amount text-lg text-neutral-900">
          {formatMoney(totalInGroupCurrency, group.currency)}
        </span>
      </div>

      <div className="mb-3">
        <label htmlFor="expense-sort" className="label">
          Sort by
        </label>
        <div className="relative">
          <ArrowDownWideNarrow
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          />
          <select
            id="expense-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            className="w-full appearance-none rounded-xl border border-[#E9E9F2] bg-white py-2.5 pl-9 pr-3 text-base text-neutral-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses…"
            aria-label="Search expenses"
            className="w-full rounded-xl border border-[#E9E9F2] bg-white py-2.5 pl-9 pr-9 text-base text-neutral-900 placeholder:text-neutral-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <CategoryFilter
          value={filter}
          onChange={setFilter}
          available={availableCategories}
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title={query ? `No match for "${query}"` : "Nothing in that category"}
          description={
            query
              ? "Try a different search term, or clear the category filter."
              : "Try a different filter to see more expenses."
          }
        />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((expense, index) => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              members={group.members}
              index={index}
              deleting={deletingId === expense.id}
              onEdit={() => navigate(`/groups/${group.id}/expenses/${expense.id}/edit`)}
              onDelete={() => setPendingDelete(expense)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete expense?"
        message={
          pendingDelete
            ? `"${pendingDelete.description}" (${formatMoney(
                pendingDelete.amountMinor,
                pendingDelete.currency
              )}) will be removed and balances recalculated.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
