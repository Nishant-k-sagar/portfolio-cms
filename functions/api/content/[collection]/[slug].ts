import { getEntry } from "../../../_lib/content";
import { clientIp, json, toErrorResponse } from "../../../_lib/http";
import { requireSession } from "../../../_lib/session";
import { rateLimit } from "../../../_lib/rateLimit";
import type { Env } from "../../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  try {
    rateLimit(`content-read:${clientIp(request)}`, 90, 60_000);
    await requireSession(request, env);
    const collection = String(params.collection ?? "");
    const slug = String(params.slug ?? "");
    const url = new URL(request.url);
    const source = url.searchParams.get("source") ?? undefined;
    return json(await getEntry(env, collection, slug, source));
  } catch (error) {
    return toErrorResponse(error, "Could not read entry.");
  }
};
