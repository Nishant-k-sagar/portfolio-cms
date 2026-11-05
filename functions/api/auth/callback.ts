import config from "../../../cms.config";
import { clientIp, errorJson, toErrorResponse } from "../../_lib/http";
import {
  clearStateCookie,
  createSessionCookie,
  readStateCookie,
} from "../../_lib/session";
import { rateLimit } from "../../_lib/rateLimit";
import { requireEnv, type Env } from "../../_lib/env";

interface GitHubUser {
  login?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    rateLimit(`oauth-callback:${clientIp(request)}`, 20, 60_000);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readStateCookie(request);
    if (!code || !state || !expectedState || state !== expectedState) {
      return errorJson("forbidden", "Invalid sign-in state. Try again.", 403);
    }

    const clientId = requireEnv(env, "GITHUB_OAUTH_CLIENT_ID");
    const clientSecret = requireEnv(env, "GITHUB_OAUTH_CLIENT_SECRET");
    const redirectUri = `${url.origin}/api/auth/callback`;
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "portfolio-cms",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );
    if (!tokenResponse.ok)
      return errorJson("upstream_error", "GitHub sign-in failed.", 502);
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token)
      return errorJson("upstream_error", "GitHub sign-in failed.", 502);

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${tokenBody.access_token}`,
        "user-agent": "portfolio-cms",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!userResponse.ok)
      return errorJson("upstream_error", "GitHub profile lookup failed.", 502);
    const user = (await userResponse.json()) as GitHubUser;
    const login = user.login ?? "";
    const allowList =
      env.ALLOWED_LOGINS?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? config.allowList;
    if (!allowList.includes(login)) {
      console.error(
        JSON.stringify({ level: "warn", event: "signin_rejected", login }),
      );
      return errorJson(
        "forbidden",
        "This GitHub account is not allowed to sign in.",
        403,
      );
    }

    const sessionCookie = await createSessionCookie(login, env);
    console.log(
      JSON.stringify({ level: "info", event: "signin_success", login }),
    );
    const headers = new Headers();
    headers.set("location", "/");
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", clearStateCookie());
    headers.set("cache-control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return toErrorResponse(error, "Sign-in failed.");
  }
};
