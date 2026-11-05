import { errorJson, json } from "../../_lib/http";
import { verifySessionCookie } from "../../_lib/session";
import type { Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await verifySessionCookie(request, env);
  if (!session) return errorJson("unauthorized", "Sign in required.", 401);
  return json({ login: session.login });
};
