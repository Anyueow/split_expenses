import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";
import { MemberChip } from "../components/MemberChip";
import { CategoryPicker } from "../components/CategoryPicker";
import { SplitInput } from "../components/SplitInput";
import { ErrorBlock, LoadingBlock, Spinner } from "../components/Spinner";
import * as api from "../lib/api";
import {
  currencySymbol,
  minorToInput,
  parseAmountToMinor,
  toDateInputValue,
  todayIso,
} from "../lib/format";
import {
  computeEqualSplits,
  computePercentageSplits,
  validateSplits,
} from "../lib/splitCalc";
import {
  CURRENCIES,
  type Category,
  type Currency,
  type Expense,
  type Group,
  type Split,
  type SplitType,
} from "../lib/types";

export default function AddExpense() {
  const { groupId = "", expenseId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(expenseId);

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [date, setDate] = useState(todayIso);
  const [category, setCategory] = useState<Category>("food");
  const [paidBy, setPaidBy] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manual edits stop the auto-seeding effects from overwriting user input.
  const [percentTouched, setPercentTouched] = useState(false);
  const [exactTouched, setExactTouched] = useState(false);

  const descriptionRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    navigate(`/groups/${groupId}/expenses`, { replace: true });
  }, [navigate, groupId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.getGroup(groupId);
      setGroup(data.group);
      setCurrency(data.group.currency);
      setSelectedIds(data.group.members.map((m) => m.id));
      setPaidBy(data.group.members[0]?.id ?? "");

      if (expenseId) {
        const existing = data.expenses?.find((e: Expense) => e.id === expenseId);
        if (!existing) {
          setLoadError("That expense no longer exists.");
          return;
        }
        setDescription(existing.description);
        setAmountInput(minorToInput(existing.amountMinor));
        setCurrency(existing.currency);
        setDate(toDateInputValue(existing.date));
        setCategory(existing.category);
        setPaidBy(existing.paidBy);
        setSelectedIds(existing.splits.map((s) => s.memberId));
        setSplitType(existing.splitType);
        setNote(existing.note ?? "");
        // Only treat stored values as authoritative when they are actually
        // present; otherwise let the seeding effects fill the blanks in.
        const hasPercentages = existing.splits.some(
          (s) => typeof s.percentage === "number"
        );
        const hasAmounts = existing.splits.some(
          (s) => typeof s.amountMinor === "number" && s.amountMinor > 0
        );
        if (hasPercentages) {
          setPercentages(
            Object.fromEntries(
              existing.splits.map((s) => [s.memberId, String(s.percentage ?? 0)])
            )
          );
        }
        if (hasAmounts) {
          setExactAmounts(
            Object.fromEntries(
              existing.splits.map((s) => [s.memberId, minorToInput(s.amountMinor ?? 0)])
            )
          );
        }
        setPercentTouched(hasPercentages);
        setExactTouched(hasAmounts);
      }
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setLoadError(err instanceof Error ? err.message : "Couldn't load this group.");
    } finally {
      setLoading(false);
    }
  }, [groupId, expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && !isEdit) descriptionRef.current?.focus();
  }, [loading, isEdit]);

  const members = group?.members ?? [];
  const amountMinor = parseAmountToMinor(amountInput, currency);
  const participants = useMemo(
    () => members.filter((m) => selectedIds.includes(m.id)),
    [members, selectedIds]
  );
  const participantKey = selectedIds.join("|");

  // Keep untouched percentage inputs spread evenly across the participants.
  useEffect(() => {
    if (splitType !== "percentage" || percentTouched || participants.length === 0) return;
    const even = 100 / participants.length;
    const rounded = Math.floor(even * 10) / 10;
    setPercentages(() => {
      const next: Record<string, string> = {};
      participants.forEach((m, index) => {
        // The last participant absorbs the rounding drift so the total hits 100.
        next[m.id] =
          index === participants.length - 1
            ? (100 - rounded * (participants.length - 1)).toFixed(1)
            : rounded.toFixed(1);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, percentTouched, participantKey]);

  // Same for exact amounts, which additionally track the running total.
  useEffect(() => {
    if (splitType !== "exact" || exactTouched || participants.length === 0) return;
    const splits = computeEqualSplits(
      amountMinor,
      participants.map((m) => m.id),
      members
    );
    setExactAmounts(
      Object.fromEntries(splits.map((s) => [s.memberId, minorToInput(s.amountMinor ?? 0)]))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, exactTouched, participantKey, amountMinor]);

  const splits: Split[] = useMemo(() => {
    if (splitType === "percentage") {
      return participants.map((m) => ({
        memberId: m.id,
        percentage: Number.parseFloat(percentages[m.id] ?? "") || 0,
      }));
    }
    if (splitType === "exact") {
      return participants.map((m) => ({
        memberId: m.id,
        amountMinor: parseAmountToMinor(exactAmounts[m.id] ?? "", currency),
      }));
    }
    return participants.map((m) => ({ memberId: m.id }));
  }, [splitType, participants, percentages, exactAmounts, currency]);

  const validation = validateSplits(splitType, amountMinor, splits, members);
  const descriptionMissing = description.trim().length === 0;
  const canSave = !descriptionMissing && Boolean(paidBy) && validation.valid && !saving;

  const blockReason = descriptionMissing
    ? "Add a description to save."
    : !paidBy
      ? "Choose who paid."
      : !validation.valid
        ? validation.error
        : null;

  function changeSplitType(next: SplitType) {
    setSplitType(next);
    if (next === "percentage") setPercentTouched(false);
    if (next === "exact") setExactTouched(false);
  }

  function toggleParticipant(memberId: string) {
    setSelectedIds((ids) =>
      ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId]
    );
  }

  async function handleSave() {
    if (!group || !canSave) return;
    setSaving(true);
    setSaveError(null);

    // Send resolved minor-unit amounts alongside the raw input so the server
    // never has to guess; it re-resolves them anyway.
    let payloadSplits: Split[];
    if (splitType === "equal") {
      payloadSplits = computeEqualSplits(
        amountMinor,
        participants.map((m) => m.id),
        members
      );
    } else if (splitType === "percentage") {
      payloadSplits = computePercentageSplits(amountMinor, splits, members);
    } else {
      payloadSplits = splits;
    }

    const payload: api.ExpenseInput = {
      description: description.trim(),
      amountMinor,
      currency,
      paidBy,
      splitType,
      splits: payloadSplits,
      category,
      date,
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    try {
      if (expenseId) {
        await api.updateExpense(group.id, expenseId, payload);
      } else {
        await api.createExpense(group.id, payload);
      }
      close();
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      setSaveError(err instanceof Error ? err.message : "Couldn't save the expense.");
      setSaving(false);
    }
  }

  return (
    <div className="animate-sheet-up fixed inset-0 z-40 flex flex-col bg-neutral-100">
      <header className="flex shrink-0 items-center gap-2 border-b border-[#E9E9F2] bg-white px-4 pb-3 pt-[calc(0.75rem+var(--safe-top))]">
        <h1 className="flex-1 text-lg text-neutral-900">
          {isEdit ? "Edit expense" : "New expense"}
        </h1>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </header>

      {loading ? (
        <LoadingBlock />
      ) : loadError || !group ? (
        <div className="px-4 pt-6">
          <ErrorBlock message={loadError ?? "Group not found."} onRetry={() => void load()} />
          <button type="button" onClick={close} className="btn-ghost mx-auto mt-2 w-full max-w-sm">
            Go back
          </button>
        </div>
      ) : (
        <>
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-5 overflow-y-auto px-4 py-5">
            <div>
              <label htmlFor="expense-description" className="label">
                Description
              </label>
              <input
                id="expense-description"
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Dinner at the harbour"
                autoComplete="off"
                enterKeyHint="next"
                className="field"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="expense-amount" className="label">
                  Amount
                </label>
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-neutral-500"
                  >
                    {currencySymbol(currency)}
                  </span>
                  <input
                    id="expense-amount"
                    type="text"
                    inputMode="decimal"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="field amount h-14 pl-11 text-2xl"
                  />
                </div>
              </div>
              <div className="w-28">
                <label htmlFor="expense-currency" className="label">
                  Currency
                </label>
                <select
                  id="expense-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="field h-14"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="expense-date" className="label">
                Date
              </label>
              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <span className="label">Category</span>
              <CategoryPicker value={category} onChange={setCategory} />
            </div>

            <div>
              <span className="label">Paid by</span>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {members.map((member) => (
                  <MemberChip
                    key={member.id}
                    member={member}
                    selected={member.id === paidBy}
                    onClick={() => setPaidBy(member.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label">Split between</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds(
                      selectedIds.length === members.length
                        ? []
                        : members.map((m) => m.id)
                    )
                  }
                  className="mb-1.5 text-xs font-semibold text-primary"
                >
                  {selectedIds.length === members.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((member) => (
                  <MemberChip
                    key={member.id}
                    member={member}
                    selected={selectedIds.includes(member.id)}
                    showCheck
                    onClick={() => toggleParticipant(member.id)}
                  />
                ))}
              </div>
            </div>

            <SplitInput
              splitType={splitType}
              onSplitTypeChange={changeSplitType}
              participants={participants}
              allMembers={members}
              amountMinor={amountMinor}
              currency={currency}
              percentages={percentages}
              onPercentageChange={(memberId, value) => {
                setPercentTouched(true);
                setPercentages((prev) => ({ ...prev, [memberId]: value }));
              }}
              exactAmounts={exactAmounts}
              onExactAmountChange={(memberId, value) => {
                setExactTouched(true);
                setExactAmounts((prev) => ({ ...prev, [memberId]: value }));
              }}
              error={amountInput && !validation.valid ? validation.error : null}
            />

            <div>
              <label htmlFor="expense-note" className="label">
                Note <span className="font-normal normal-case">(optional)</span>
              </label>
              <textarea
                id="expense-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything worth remembering"
                className="field resize-none"
              />
            </div>

            {saveError && (
              <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">
                {saveError}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E9E9F2] bg-white px-4 pb-[calc(1rem+var(--safe-bottom))] pt-4">
            {blockReason && !saving && (
              <p className="mx-auto mb-2.5 max-w-2xl text-center text-xs text-neutral-500">
                {blockReason}
              </p>
            )}
            <div className="mx-auto flex max-w-2xl gap-3">
              <button type="button" onClick={close} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canSave}
                className="btn-primary flex-[2]"
              >
                {saving ? <Spinner className="h-4 w-4" /> : isEdit ? "Save changes" : "Add expense"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
