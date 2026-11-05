import { clientIp, errorJson } from "../../_lib/http";
import { createStateCookie, randomToken } from "../../_lib/session";
import { rateLimit } from "../../_lib/rateLimit";
import { requireEnv, type Env } from "../../_lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    rateLimit(`oauth-login:${clientIp(request)}`, 10, 60_000);
    const clientId = requireEnv(env, "GITHUB_OAUTH_CLIENT_ID");
    const state = randomToken(24);
    const url = new URL(request.url);
    const redirectUri = `${url.origin}/api/auth/callback`;
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", "read:user");
    authorize.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        location: authorize.toString(),
        "set-cookie": createStateCookie(state),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return errorJson("config_error", "Sign-in is not configured.", 500);
  }
};
