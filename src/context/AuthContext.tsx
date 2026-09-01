import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "../lib/api";

const HINT_COOKIE = "spliteasy_logged_in";

/** Non-HttpOnly hint cookie: lets the shell render optimistically before the probe lands. */
function readHintCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${HINT_COOKIE}=`));
}

interface AuthContextValue {
  authenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(readHintCookie);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .probeAuth()
      .then((result) => {
        if (!cancelled) setAuthenticated(Boolean(result?.authenticated));
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from anywhere in the app means the session died mid-use.
  useEffect(() => api.onUnauthorized(() => setAuthenticated(false)), []);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAuthenticated(false);
    }
  }, []);

  const value = useMemo(
    () => ({ authenticated, loading, login, logout }),
    [authenticated, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}
