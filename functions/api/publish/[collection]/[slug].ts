import { publishEntry } from "../../../_lib/content";
import { requireCsrf } from "../../../_lib/csrf";
import { clientIp, json, readJson, toErrorResponse } from "../../../_lib/http";
import { requireSession } from "../../../_lib/session";
import { rateLimit } from "../../../_lib/rateLimit";
import type { Env } from "../../../_lib/env";

interface PublishBody {
  overwrite?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  try {
    requireCsrf(request);
    rateLimit(`publish:${clientIp(request)}`, 20, 60_000);
    await requireSession(request, env);
    const body = await readJson<PublishBody>(request, 1024).catch(
      () => ({}) as PublishBody,
    );
    const collection =
      typeof params.collection === "string" ? params.collection : "";
    const slug = typeof params.slug === "string" ? params.slug : "";
    return json(
      await publishEntry(env, collection, slug, Boolean(body.overwrite)),
    );
  } catch (error) {
    return toErrorResponse(error, "Could not publish.");
  }
};
