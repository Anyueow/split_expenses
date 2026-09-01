import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, LogOut, Plus, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./Modal";
import { Spinner } from "./Spinner";
import * as api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { CURRENCIES, MEMBER_COLORS, type Currency, type Group } from "../lib/types";

export function SettingsTab({
  group,
  onChanged,
}: {
  group: Group;
  onChanged: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState<Currency>(group.currency);
  const [members, setMembers] = useState<api.MemberInput[]>(group.members);
  const [memberDraft, setMemberDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  useEffect(() => {
    setName(group.name);
    setCurrency(group.currency);
    setMembers(group.members);
  }, [group]);

  const dirty =
    name !== group.name ||
    currency !== group.currency ||
    members.length !== group.members.length ||
    members.some((m, i) => m.id !== group.members[i]?.id || m.name !== group.members[i]?.name);

  function addMember() {
    const trimmed = memberDraft.trim();
    if (!trimmed) return;
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`${trimmed} is already in this group.`);
      return;
    }
    setMembers((list) => [
      ...list,
      { name: trimmed, color: MEMBER_COLORS[list.length % MEMBER_COLORS.length] },
    ]);
    setMemberDraft("");
    setError(null);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      setError("The group needs a name.");
      return;
    }
    if (members.length === 0) {
      setError("A group needs at least one member.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateGroup(group.id, {
        name: name.trim(),
        currency,
        members: members.map((m) => ({
          ...(m.id ? { id: m.id } : {}),
          name: m.name,
          ...(m.color ? { color: m.color } : {}),
        })),
      });
      await onChanged();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (api.isApiError(err) && err.isUnauthorized) return;
      // Includes the server's "can't remove X, they have expenses" message.
      setError(err instanceof Error ? err.message : "Couldn't save your changes.");
      setMembers(group.members);
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup() {
    setDeletingGroup(true);
    try {
      await api.deleteGroup(group.id);
      navigate("/groups", { replace: true });
    } catch (err) {
      if (!(api.isApiError(err) && err.isUnauthorized)) {
        setError(err instanceof Error ? err.message : "Couldn't delete the group.");
      }
      setDeletingGroup(false);
      setConfirmDeleteGroup(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <label htmlFor="settings-name" className="label">
          Group name
        </label>
        <input
          id="settings-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
        />

        <label htmlFor="settings-currency" className="label mt-4">
          Default currency
        </label>
        <select
          id="settings-currency"
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
        <p className="mt-1.5 text-xs text-neutral-500">
          New expenses default to this. Existing expenses keep the currency they were
          entered in.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="label">Members</h2>
        <ul className="mb-3 divide-y divide-neutral-100">
          {members.map((member, index) => (
            <li key={member.id ?? `new-${index}`} className="flex items-center gap-3 py-2.5">
              <Avatar
                member={{
                  name: member.name,
                  color: member.color ?? MEMBER_COLORS[index % MEMBER_COLORS.length],
                }}
                size="md"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                {member.name}
                {!member.id && (
                  <span className="ml-2 rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    new
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  setMembers((list) => list.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${member.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <label htmlFor="settings-add-member" className="sr-only">
            Add a member
          </label>
          <input
            id="settings-add-member"
            value={memberDraft}
            onChange={(e) => setMemberDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addMember();
              }
            }}
            placeholder="Add a member"
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
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !dirty}
        className="btn-primary w-full"
      >
        {saving ? (
          <Spinner className="h-4 w-4" />
        ) : saved ? (
          <>
            <Check aria-hidden className="h-4 w-4" />
            Saved
          </>
        ) : (
          "Save changes"
        )}
      </button>

      <section className="space-y-3">
        <a href={api.exportCsvUrl(group.id)} download className="btn-secondary w-full">
          <Download aria-hidden className="h-4 w-4" />
          Export as CSV
        </a>

        <button
          type="button"
          onClick={() => setConfirmDeleteGroup(true)}
          className="btn-ghost w-full text-danger hover:bg-danger/10"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Delete group
        </button>
      </section>

      <div className="border-t border-[#E4E4EF] pt-6">
        <button
          type="button"
          onClick={() => void logout()}
          className="btn-danger w-full"
        >
          <LogOut aria-hidden className="h-4 w-4" />
          Logout
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteGroup}
        title="Delete this group?"
        message={`"${group.name}", along with every expense and settlement in it, will be permanently removed.`}
        confirmLabel="Delete group"
        destructive
        busy={deletingGroup}
        onConfirm={() => void removeGroup()}
        onCancel={() => setConfirmDeleteGroup(false)}
      />
    </div>
  );
}
