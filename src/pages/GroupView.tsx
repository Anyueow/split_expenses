import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { ExpensesTab } from "../components/ExpensesTab";
import { BalancesTab } from "../components/BalancesTab";
import { ReportsTab } from "../components/ReportsTab";
import { SettingsTab } from "../components/SettingsTab";
import { ErrorBlock, LoadingBlock } from "../components/Spinner";
import * as api from "../lib/api";
import type { Expense, Group, Settlement } from "../lib/types";

const TABS = [
  { id: "expenses", label: "Expenses", emoji: "📝" },
  { id: "balances", label: "Balances", emoji: "⚖️" },
  { id: "reports", label: "Reports", emoji: "📊" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(value: string | undefined): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export default function GroupView() {
  const { groupId = "", tab } = useParams();
  const navigate = useNavigate();
  const activeTab: TabId = isTabId(tab) ? tab : "expenses";

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getGroup(groupId);
      setGroup(data.group);
      setExpenses(data.expenses ?? []);
      setSettlements(data.settlements ?? []);
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setError(err instanceof Error ? err.message : "Couldn't load this group.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-[100dvh]">
        <LoadingBlock label="Loading group…" />
      </main>
    );
  }

  if (error || !group) {
    return (
      <main className="min-h-[100dvh] px-4 pt-[calc(2rem+var(--safe-top))]">
        <ErrorBlock message={error ?? "Group not found."} onRetry={() => void load()} />
        <div className="mx-auto max-w-sm">
          <Link to="/groups" className="btn-ghost w-full">
            Back to groups
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="animate-fade-in min-h-[100dvh] md:pl-[var(--sidebar-width)]">
      {/* Desktop: persistent left sidebar. Mobile: bottom tab bar (below). */}
      <nav
        aria-label="Group sections"
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-[#E9E9F2] bg-white/95 px-3 pb-4 pt-[calc(1rem+var(--safe-top))] backdrop-blur md:flex"
      >
        <Link
          to="/groups"
          className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ChevronLeft aria-hidden className="h-4 w-4 shrink-0" />
          All groups
        </Link>

        <div className="mb-4 px-3 pt-2">
          <p className="truncate text-base font-semibold tracking-tight text-neutral-900">
            {group.name}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-neutral-500">
            {group.members.length} {group.members.length === 1 ? "member" : "members"} ·{" "}
            {group.currency}
          </p>
        </div>

        <ul className="flex flex-1 flex-col gap-1">
          {TABS.map((item) => {
            const selected = item.id === activeTab;
            return (
              <li key={item.id}>
                <Link
                  to={`/groups/${group.id}/${item.id}`}
                  replace
                  aria-current={selected ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    selected
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {item.emoji}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {activeTab === "expenses" && (
          <button
            type="button"
            onClick={() => navigate(`/groups/${group.id}/expenses/new`)}
            className="btn-primary mt-2 w-full py-2.5 text-sm"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Add expense
          </button>
        )}
      </nav>

      {/* Mobile-only header; the sidebar carries this on desktop. */}
      <header className="sticky top-0 z-20 border-b border-[#E9E9F2] bg-neutral-100/90 px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Link
            to="/groups"
            aria-label="Back to groups"
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg text-neutral-900">
            {group.name}
          </h1>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-500">
            {group.currency}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(var(--tabbar-height)+6rem+var(--safe-bottom))] pt-4 md:max-w-6xl md:px-8 md:pb-12 md:pt-8">
        {activeTab === "expenses" && (
          <ExpensesTab
            group={group}
            expenses={expenses}
            onChanged={load}
            onExpensesChange={setExpenses}
          />
        )}
        {activeTab === "balances" && (
          <BalancesTab
            group={group}
            settlements={settlements}
            onChanged={load}
          />
        )}
        {activeTab === "reports" && (
          <ReportsTab group={group} expenses={expenses} settlements={settlements} />
        )}
        {activeTab === "settings" && <SettingsTab group={group} onChanged={load} />}
      </main>

      {activeTab === "expenses" && (
        <button
          type="button"
          onClick={() => navigate(`/groups/${group.id}/expenses/new`)}
          aria-label="Add expense"
          className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform duration-150 active:scale-95 md:hidden"
          style={{
            bottom: "calc(var(--tabbar-height) + var(--safe-bottom) + 1rem)",
          }}
        >
          <Plus aria-hidden className="h-6 w-6" />
        </button>
      )}

      <nav
        aria-label="Group sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E9E9F2] bg-white/95 pb-[var(--safe-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map((item) => {
            const selected = item.id === activeTab;
            return (
              <li key={item.id} className="flex-1">
                <Link
                  to={`/groups/${group.id}/${item.id}`}
                  replace
                  aria-current={selected ? "page" : undefined}
                  className={`flex h-[var(--tabbar-height)] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors duration-150 ${
                    selected ? "text-primary" : "text-neutral-500"
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {item.emoji}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
