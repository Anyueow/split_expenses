import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { ExpenseCard } from "./ExpenseCard";
import { CategoryFilter } from "./CategoryPicker";
import { EmptyState } from "./EmptyState";
import { ConfirmDialog } from "./Modal";
import * as api from "../lib/api";
import { formatMoney } from "../lib/format";
import type { Category, Expense, Group } from "../lib/types";

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
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableCategories = useMemo(
    () => [...new Set(expenses.map((e) => e.category))],
    [expenses]
  );

  const visible = useMemo(
    () => (filter === "all" ? expenses : expenses.filter((e) => e.category === filter)),
    [expenses, filter]
  );

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
        description="Add the first one and SplitEasy will keep track of who owes what."
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
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
        </span>
        <span className="amount text-lg text-neutral-900">
          {formatMoney(totalInGroupCurrency, group.currency)}
        </span>
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
          title="Nothing in that category"
          description="Try a different filter to see more expenses."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((expense, index) => (
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
