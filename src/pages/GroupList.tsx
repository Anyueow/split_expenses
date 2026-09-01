import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Users, Wallet } from "lucide-react";
import { NameChip } from "../components/MemberChip";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { ErrorBlock, LoadingBlock, Spinner } from "../components/Spinner";
import * as api from "../lib/api";
import { formatMoney } from "../lib/format";
import { CURRENCIES, MEMBER_COLORS, type Currency } from "../lib/types";

/**
 * Module-level so the single-group auto-jump fires once per page load —
 * otherwise leaving a group would immediately bounce the user back into it.
 */
let autoNavigated = false;

export default function GroupList() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<api.GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.listGroups();
      const list = result.groups ?? [];
      if (!autoNavigated && list.length === 1) {
        autoNavigated = true;
        navigate(`/groups/${list[0].id}`, { replace: true });
        return;
      }
      autoNavigated = true;
      setGroups(list);
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setError(err instanceof Error ? err.message : "Couldn't load your groups.");
      setGroups([]);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="animate-fade-in mx-auto min-h-[100dvh] w-full max-w-2xl px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1.5rem+var(--safe-top))]">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
          <Wallet aria-hidden className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-xl text-neutral-900">Your groups</h1>
          <p className="text-xs text-neutral-500">SplitEasy</p>
        </div>
        {groups && groups.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary px-3.5 py-2.5 text-sm"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New
          </button>
        )}
      </header>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {!groups && !error && <LoadingBlock label="Loading groups…" />}

      {groups && groups.length === 0 && !error && (
        <EmptyState
          emoji="🧳"
          title="No groups yet"
          description="Create one for your next trip, then start adding expenses."
          action={
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary px-5"
            >
              <Plus aria-hidden className="h-4 w-4" />
              New group
            </button>
          }
        />
      )}

      {groups && groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map((group, index) => (
            <li
              key={group.id}
              className="animate-slide-up"
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <button
                type="button"
                onClick={() => navigate(`/groups/${group.id}`)}
                className="card flex w-full items-center gap-4 p-4 text-left transition-transform duration-150 active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-neutral-900">
                    {group.name}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                    <Users aria-hidden className="h-3.5 w-3.5" />
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "member" : "members"}
                    <span aria-hidden>·</span>
                    {group.expenseCount}{" "}
                    {group.expenseCount === 1 ? "expense" : "expenses"}
                    <span aria-hidden>·</span>
                    {group.currency}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="amount block text-base text-neutral-900">
                    {formatMoney(group.totalSpentMinor, group.currency)}
                  </span>
                  <span className="block text-[11px] text-neutral-500">total spent</span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateGroupModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(groupId) => navigate(`/groups/${groupId}`)}
      />
    </main>
  );
}

function CreateGroupModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [members, setMembers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setCurrency("EUR");
      setMembers([]);
      setMemberDraft("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  function addMember() {
    const trimmed = memberDraft.trim();
    if (!trimmed) return;
    if (members.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      setError(`${trimmed} is already on the list.`);
      return;
    }
    setMembers((list) => [...list, trimmed]);
    setMemberDraft("");
    setError(null);
    memberInputRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    // A name typed but not yet committed with Enter still counts.
    const pending = memberDraft.trim();
    const finalMembers = pending && !members.includes(pending) ? [...members, pending] : members;

    if (!name.trim()) {
      setError("Give the group a name.");
      return;
    }
    if (finalMembers.length === 0) {
      setError("Add at least one member.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { group } = await api.createGroup({
        name: name.trim(),
        currency,
        members: finalMembers,
      });
      onCreated(group.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the group.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New group" labelledBy="new-group-title">
      <form onSubmit={handleSubmit}>
        <label htmlFor="group-name" className="label">
          Group name
        </label>
        <input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lisbon trip"
          autoComplete="off"
          className="field"
        />

        <label htmlFor="group-currency" className="label mt-4">
          Default currency
        </label>
        <select
          id="group-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="field"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <label htmlFor="member-name" className="label mt-4">
          Members
        </label>
        <div className="flex gap-2">
          <input
            id="member-name"
            ref={memberInputRef}
            value={memberDraft}
            onChange={(e) => setMemberDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMember();
              }
            }}
            placeholder="Add a name"
            autoComplete="off"
            className="field flex-1"
          />
          <button
            type="button"
            onClick={addMember}
            aria-label="Add member"
            className="btn-secondary shrink-0 px-4"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        </div>

        {members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {members.map((member, index) => (
              <NameChip
                key={member}
                name={member}
                color={MEMBER_COLORS[index % MEMBER_COLORS.length]}
                onRemove={() => setMembers((list) => list.filter((m) => m !== member))}
              />
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : "Create group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
