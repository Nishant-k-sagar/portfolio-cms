import { listEntries } from "../../_lib/content";
import { clientIp, json, toErrorResponse } from "../../_lib/http";
import { requireSession } from "../../_lib/session";
import { rateLimit } from "../../_lib/rateLimit";
import type { Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    rateLimit(`drafts-list:${clientIp(request)}`, 60, 60_000);
    await requireSession(request, env);
    const entries = (await listEntries(env)).filter(
      (entry) => entry.state !== "published",
    );
    entries.sort((a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
    );
    return json({ drafts: entries });
  } catch (error) {
    return toErrorResponse(error, "Could not list drafts.");
  }
};
