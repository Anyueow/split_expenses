import { Loader2 } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 aria-hidden className={`h-5 w-5 animate-spin ${className}`} />;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 py-16 text-neutral-500"
    >
      <Spinner className="h-6 w-6 text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto my-8 max-w-sm rounded-2xl bg-danger/10 p-5 text-center"
    >
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-4 w-full">
          Try again
        </button>
      )}
    </div>
  );
}
