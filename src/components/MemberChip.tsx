import { Check, X } from "lucide-react";
import { Avatar } from "./Avatar";
import type { Member } from "../lib/types";

export function MemberChip({
  member,
  selected = false,
  onClick,
  showCheck = false,
  disabled = false,
}: {
  member: Member;
  selected?: boolean;
  onClick?: () => void;
  showCheck?: boolean;
  disabled?: boolean;
}) {
  const interactive = Boolean(onClick);
  const classes = [
    "inline-flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium",
    "transition-[background-color,border-color,transform] duration-150",
    interactive ? "active:scale-[0.97]" : "",
    selected
      ? "border-primary bg-primary-light text-primary"
      : "border-[#E4E4EF] bg-white text-neutral-500",
    disabled ? "pointer-events-none opacity-40" : "",
  ].join(" ");

  const content = (
    <>
      <Avatar member={member} size="sm" />
      <span className="max-w-[9rem] truncate">{member.name}</span>
      {showCheck && selected && <Check aria-hidden className="h-3.5 w-3.5" />}
    </>
  );

  if (!interactive) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={classes}
    >
      {content}
    </button>
  );
}

/** Editable name chip used by the group create form and the settings tab. */
export function NameChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#E4E4EF] bg-white py-1.5 pl-1.5 pr-2 text-sm font-medium text-neutral-900">
      <Avatar member={{ name, color }} size="sm" />
      <span className="max-w-[10rem] truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
