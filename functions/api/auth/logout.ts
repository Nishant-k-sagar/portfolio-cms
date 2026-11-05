import { requireCsrf } from "../../_lib/csrf";
import { json } from "../../_lib/http";
import { clearSessionCookie } from "../../_lib/session";

export const onRequestPost: PagesFunction = async ({ request }) => {
  requireCsrf(request);
  return json(
    { ok: true },
    { headers: { "set-cookie": clearSessionCookie() } },
  );
};
