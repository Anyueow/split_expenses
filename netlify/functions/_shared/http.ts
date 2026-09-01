export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string> | Headers
): Response {
  // Built from a Headers instance so callers can append multiple Set-Cookie values.
  const headers =
    extraHeaders instanceof Headers ? new Headers(extraHeaders) : new Headers(extraHeaders ?? {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

export function csv(text: string, filename: string): Response {
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function methodNotAllowed(method: string): never {
  throw new HttpError(405, `Method ${method} not allowed`);
}

type Handler = (req: Request, context?: unknown) => Promise<Response> | Response;

/**
 * Wraps a handler so HttpError surfaces its status/message and anything else
 * becomes an opaque 500 — internals are logged, never sent to the client.
 */
export function handle(fn: Handler): Handler {
  return async (req: Request, context?: unknown): Promise<Response> => {
    try {
      return await fn(req, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status);
      }
      console.error("Unhandled function error:", err);
      return json({ error: "Internal error" }, 500);
    }
  };
}

/**
 * Pulls an id out of the request path as a fallback for the query string.
 *
 * The netlify.toml redirects carry ids across as query params
 * (`/api/groups/:id/expenses` -> `expenses?groupId=:id`), and that substitution
 * works under `netlify dev` but not on the deployed edge, where the function
 * runs with the placeholder unresolved. Rather than depend on redirect
 * semantics, read the id straight off `/api/groups/<id>/<section>/<subId>`.
 */
function pathParam(req: Request, name: string): string | undefined {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const groupsAt = segments.indexOf("groups");
  if (groupsAt === -1) return undefined;

  if (name === "groupId") return segments[groupsAt + 1];

  const section = { expenseId: "expenses", settlementId: "settlements" }[name];
  if (!section || segments[groupsAt + 2] !== section) return undefined;
  return segments[groupsAt + 3];
}

/** Reads a query param, tolerating the function being hit directly with extra path segments. */
export function queryParam(req: Request, name: string): string | undefined {
  const value = new URL(req.url).searchParams.get(name);
  if (value !== null && value !== "" && !value.startsWith(":")) return value;
  return pathParam(req, name);
}

export function requireQueryParam(req: Request, name: string): string {
  const value = queryParam(req, name);
  if (!value) throw new HttpError(400, `Missing ${name}`);
  return value;
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "Invalid JSON body");
  }
  return parsed as Record<string, unknown>;
}
