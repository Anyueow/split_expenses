import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { Spinner } from "./Spinner";

export function PasswordGate({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong password");
      setShaking(true);
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="animate-fade-in flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(2rem+var(--safe-top))]">
      <div
        className={`w-full max-w-sm ${shaking ? "animate-shake" : ""}`}
        onAnimationEnd={() => setShaking(false)}
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <Wallet aria-hidden className="h-7 w-7" />
          </div>
          <h1 className="text-2xl text-neutral-900">SplitEasy</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Shared expenses, settled simply.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-5">
          <label htmlFor="password" className="label">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              ref={inputRef}
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "password-error" : undefined}
              className="field pr-12"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              {visible ? (
                <EyeOff aria-hidden className="h-4.5 w-4.5" />
              ) : (
                <Eye aria-hidden className="h-4.5 w-4.5" />
              )}
            </button>
          </div>

          {error && (
            <p id="password-error" role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="btn-primary mt-5 w-full"
          >
            {busy ? <Spinner className="h-4 w-4" /> : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
