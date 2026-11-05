import { publicConfig } from "../../shared/validation";
import { json, toErrorResponse } from "../_lib/http";
import { requireSession } from "../_lib/session";
import type { Env } from "../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await requireSession(request, env);
    return json(publicConfig());
  } catch (error) {
    return toErrorResponse(error, "Could not load configuration.");
  }
};
