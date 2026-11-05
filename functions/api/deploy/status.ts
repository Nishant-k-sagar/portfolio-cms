import { GitHubClient } from "../../_lib/github";
import { clientIp, json, toErrorResponse } from "../../_lib/http";
import { requireSession } from "../../_lib/session";
import { rateLimit } from "../../_lib/rateLimit";
import type { Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    rateLimit(`deploy-status:${clientIp(request)}`, 120, 60_000);
    await requireSession(request, env);
    const client = new GitHubClient(env);
    return json(await client.latestWorkflowRun());
  } catch (error) {
    return toErrorResponse(error, "Could not load deploy status.");
  }
};
