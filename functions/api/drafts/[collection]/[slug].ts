import { saveDraft, type SaveDraftInput } from "../../../_lib/content";
import { requireCsrf } from "../../../_lib/csrf";
import { clientIp, json, readJson, toErrorResponse } from "../../../_lib/http";
import { requireSession } from "../../../_lib/session";
import { rateLimit } from "../../../_lib/rateLimit";
import type { Env } from "../../../_lib/env";

const MAX_DRAFT_BYTES = 20 * 1024 * 1024;

export const onRequestPut: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  try {
    requireCsrf(request);
    rateLimit(`draft-save:${clientIp(request)}`, 40, 60_000);
    await requireSession(request, env);
    const body = await readJson<SaveDraftInput>(request, MAX_DRAFT_BYTES);
    const name = typeof params.collection === "string" ? params.collection : "";
    const slug = typeof params.slug === "string" ? params.slug : "";
    return json(await saveDraft(env, name, slug, body));
  } catch (error) {
    return toErrorResponse(error, "Could not save draft.");
  }
};
