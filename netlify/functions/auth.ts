import {
  checkPassword,
  clearedCookies,
  cookieHeaders,
  createToken,
  isAuthenticated,
  sessionCookies,
} from "./_shared/auth";
import { handle, HttpError, json, methodNotAllowed, queryParam, readJsonBody } from "./_shared/http";

export default handle(async (req: Request): Promise<Response> => {
  const action = queryParam(req, "action");

  if (action === "logout") {
    if (req.method !== "POST") methodNotAllowed(req.method);
    return json({ ok: true }, 200, cookieHeaders(clearedCookies()));
  }

  if (req.method === "GET") {
    return json({ authenticated: isAuthenticated(req) });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (!checkPassword(body.password)) {
      throw new HttpError(401, "Wrong password");
    }
    return json({ ok: true }, 200, cookieHeaders(sessionCookies(createToken())));
  }

  return methodNotAllowed(req.method);
});
