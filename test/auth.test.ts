import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPassword,
  clearedCookies,
  createToken,
  isAuthenticated,
  parseCookies,
  requireAuth,
  sessionCookies,
  SESSION_COOKIE,
  LOGGED_IN_COOKIE,
  SESSION_TTL_MS,
  verifyToken,
} from "../netlify/functions/_shared/auth";
import { HttpError } from "../netlify/functions/_shared/http";
import authHandler from "../netlify/functions/auth";

const TEST_SECRET = "test-secret";
const TEST_PASSWORD = "test-password";

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
  process.env.APP_PASSWORD = TEST_PASSWORD;
});

afterEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
  process.env.APP_PASSWORD = TEST_PASSWORD;
});

function requestWithCookie(cookie: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (cookie !== null) headers.set("cookie", cookie);
  return new Request("https://example.test/.netlify/functions/auth", { ...init, headers });
}

describe("token round trip", () => {
  it("accepts a token it just signed", () => {
    expect(verifyToken(createToken())).toBe(true);
  });

  it("produces the documented <expiresAtMs>.<hex> shape with a 30-day expiry", () => {
    const before = Date.now();
    const token = createToken();
    const [exp, sig] = token.split(".");

    expect(token.split(".")).toHaveLength(2);
    expect(exp).toMatch(/^\d+$/);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);

    const expiresAt = Number(exp);
    expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS - 5_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS + 5_000);
  });
});

describe("tampering", () => {
  it("rejects a token whose signature was altered", () => {
    const token = createToken();
    const [exp, sig] = token.split(".");
    const flipped = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    expect(verifyToken(`${exp}.${flipped}`)).toBe(false);
  });

  it("rejects a token whose expiry was pushed out without re-signing", () => {
    const token = createToken();
    const [exp, sig] = token.split(".");
    expect(verifyToken(`${Number(exp) + 60_000}.${sig}`)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    process.env.SESSION_SECRET = "some-other-secret";
    const foreign = createToken();
    process.env.SESSION_SECRET = TEST_SECRET;
    expect(verifyToken(foreign)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    for (const bad of [
      "",
      "garbage",
      "abc.def",
      "1234567890",
      `${Date.now() + 1000}`,
      `${Date.now() + 1000}.`,
      `${Date.now() + 1000}.zzzz`,
      `${Date.now() + 1000}.aa.bb`,
      "null",
    ]) {
      expect(verifyToken(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
    expect(verifyToken(undefined)).toBe(false);
    expect(verifyToken(null)).toBe(false);
    expect(verifyToken(12345)).toBe(false);
  });
});

describe("expiry", () => {
  it("rejects a correctly signed but expired token", () => {
    const expired = createToken(Date.now() - 1000);
    expect(verifyToken(expired)).toBe(false);
  });

  it("rejects a token that expires exactly now", () => {
    const now = Date.now();
    expect(verifyToken(createToken(now), now)).toBe(false);
  });

  it("accepts a token still inside its window", () => {
    const now = Date.now();
    expect(verifyToken(createToken(now + 60_000), now)).toBe(true);
  });
});

describe("password check", () => {
  it("accepts the configured password", () => {
    expect(checkPassword(TEST_PASSWORD)).toBe(true);
  });

  it("rejects a wrong password, including near-misses and non-strings", () => {
    expect(checkPassword("test-passwor")).toBe(false);
    expect(checkPassword("test-password ")).toBe(false);
    expect(checkPassword("")).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
    expect(checkPassword(12345)).toBe(false);
  });

  it("fails closed with a 500 when APP_PASSWORD is unset", () => {
    delete process.env.APP_PASSWORD;
    try {
      checkPassword("anything");
      throw new Error("expected checkPassword to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(500);
    }
  });

  it("fails closed with a 500 when SESSION_SECRET is unset", () => {
    delete process.env.SESSION_SECRET;
    try {
      createToken();
      throw new Error("expected createToken to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(500);
    }
  });
});

describe("parseCookies", () => {
  it("parses a multi-cookie header and decodes values", () => {
    expect(parseCookies("a=1; b=two%20words; c=")).toEqual({
      a: "1",
      b: "two words",
      c: "",
    });
  });

  it("returns an empty map for a missing header", () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("ignores junk segments without an equals sign", () => {
    expect(parseCookies("junk; a=1")).toEqual({ a: "1" });
  });
});

describe("requireAuth", () => {
  it("throws 401 when no cookie header is present", () => {
    try {
      requireAuth(requestWithCookie(null));
      throw new Error("expected requireAuth to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(401);
      expect((err as HttpError).message).toBe("Unauthorized");
    }
  });

  it("throws 401 for a garbage session cookie", () => {
    expect(() => requireAuth(requestWithCookie(`${SESSION_COOKIE}=not-a-token`))).toThrow(HttpError);
    expect(() => requireAuth(requestWithCookie("other=1"))).toThrow(HttpError);
  });

  it("throws 401 when only the JS-readable flag is set", () => {
    expect(() => requireAuth(requestWithCookie(`${LOGGED_IN_COOKIE}=true`))).toThrow(HttpError);
  });

  it("passes for a valid signed session cookie", () => {
    const req = requestWithCookie(`${SESSION_COOKIE}=${createToken()}; ${LOGGED_IN_COOKIE}=true`);
    expect(() => requireAuth(req)).not.toThrow();
    expect(isAuthenticated(req)).toBe(true);
  });

  it("throws 401 for an expired session cookie", () => {
    const req = requestWithCookie(`${SESSION_COOKIE}=${createToken(Date.now() - 1)}`);
    expect(() => requireAuth(req)).toThrow(HttpError);
  });
});

describe("cookie attributes", () => {
  it("marks the session cookie HttpOnly and the flag cookie readable", () => {
    const [session, flag] = sessionCookies("token-value");

    expect(session).toContain(`${SESSION_COOKIE}=token-value`);
    expect(session).toContain("HttpOnly");
    expect(session).toContain("Secure");
    expect(session).toContain("SameSite=Strict");
    expect(session).toContain("Path=/");
    expect(session).toContain("Max-Age=2592000");

    expect(flag).toContain(`${LOGGED_IN_COOKIE}=true`);
    expect(flag).not.toContain("HttpOnly");
    expect(flag).toContain("Secure");
    expect(flag).toContain("SameSite=Strict");
    expect(flag).toContain("Path=/");
    expect(flag).toContain("Max-Age=2592000");
  });

  it("clears both cookies on logout", () => {
    const [session, flag] = clearedCookies();
    expect(session).toContain(`${SESSION_COOKIE}=;`);
    expect(session).toContain("Max-Age=0");
    expect(session).toContain("HttpOnly");
    expect(flag).toContain(`${LOGGED_IN_COOKIE}=;`);
    expect(flag).toContain("Max-Age=0");
    expect(flag).not.toContain("HttpOnly");
  });
});

describe("auth function", () => {
  const url = "https://example.test/.netlify/functions/auth";

  it("reports authenticated:false for the probe with no cookie", async () => {
    const res = await authHandler(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("reports authenticated:true for the probe with a valid cookie", async () => {
    const res = await authHandler(
      new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${createToken()}` } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
  });

  it("returns 401 { error: 'Wrong password' } for a bad password", async () => {
    const res = await authHandler(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "nope" }),
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Wrong password" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sets both cookies and returns { ok: true } for the right password", async () => {
    const res = await authHandler(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: TEST_PASSWORD }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const flag = cookies.find((c) => c.startsWith(`${LOGGED_IN_COOKIE}=`));
    expect(session).toBeDefined();
    expect(flag).toBeDefined();
    expect(session).toContain("HttpOnly");
    expect(flag).not.toContain("HttpOnly");

    const token = session!.slice(`${SESSION_COOKIE}=`.length).split(";")[0];
    expect(verifyToken(token)).toBe(true);
  });

  it("clears cookies on ?action=logout", async () => {
    const res = await authHandler(new Request(`${url}?action=logout`, { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.every((c) => c.includes("Max-Age=0"))).toBe(true);
  });

  it("returns 405 for an unsupported method", async () => {
    const res = await authHandler(new Request(url, { method: "DELETE" }));
    expect(res.status).toBe(405);
  });

  it("returns 500 without leaking internals when APP_PASSWORD is unset", async () => {
    delete process.env.APP_PASSWORD;
    const res = await authHandler(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      })
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toContain(TEST_PASSWORD);
  });
});
