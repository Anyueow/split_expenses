import type { ReactNode } from "react";

export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        aria-hidden
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-3xl"
      >
        {emoji}
      </div>
      <h2 className="text-lg text-neutral-900">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-neutral-500">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
