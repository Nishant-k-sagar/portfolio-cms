import { errorJson, json, toErrorResponse } from "../../_lib/http";
import { verifySessionCookie } from "../../_lib/session";
import type { Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const session = await verifySessionCookie(request, env);
    if (!session) return errorJson("unauthorized", "Sign in required.", 401);
    return json({ login: session.login });
  } catch (error) {
    // A missing or short SESSION_SECRET throws an HttpError; return JSON instead of crashing the Worker.
    return toErrorResponse(error, "Could not check the session.");
  }
};
