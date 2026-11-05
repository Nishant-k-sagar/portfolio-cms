import { listEntries } from "../../_lib/content";
import { clientIp, json, toErrorResponse } from "../../_lib/http";
import { requireSession } from "../../_lib/session";
import { rateLimit } from "../../_lib/rateLimit";
import type { Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  try {
    rateLimit(`content-list:${clientIp(request)}`, 60, 60_000);
    await requireSession(request, env);
    const collection =
      typeof params.collection === "string" ? params.collection : undefined;
    return json({ entries: await listEntries(env, collection) });
  } catch (error) {
    return toErrorResponse(error, "Could not list content.");
  }
};
