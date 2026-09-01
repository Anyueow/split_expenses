import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  labelledBy = "modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy : undefined}
        className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+var(--safe-bottom))] shadow-xl sm:rounded-3xl sm:pb-5"
      >
        {title && (
          <h2 id={labelledBy} className="mb-4 text-lg text-neutral-900">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} labelledBy="confirm-title">
      {message && <p className="mb-5 text-sm leading-relaxed text-neutral-500">{message}</p>}
      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${destructive ? "btn-danger" : "btn-primary"} flex-1`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
