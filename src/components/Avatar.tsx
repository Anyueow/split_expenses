import { initials } from "../lib/format";
import type { Member } from "../lib/types";

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-11 w-11 text-sm",
} as const;

export function Avatar({
  member,
  size = "md",
  className = "",
}: {
  member: Pick<Member, "name" | "color"> | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const name = member?.name ?? "?";
  return (
    <span
      aria-hidden
      title={name}
      style={{ backgroundColor: member?.color ?? "#888888" }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase leading-none text-white ${SIZES[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  members,
  max = 4,
}: {
  members: Member[];
  max?: number;
}) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((member) => (
        <Avatar
          key={member.id}
          member={member}
          size="sm"
          className="-ml-1.5 ring-2 ring-white first:ml-0"
        />
      ))}
      {overflow > 0 && (
        <span className="-ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-500 ring-2 ring-white">
          +{overflow}
        </span>
      )}
    </span>
  );
}
