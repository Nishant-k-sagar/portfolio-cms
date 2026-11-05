import { describe, expect, it } from "vitest";
import {
  createSessionCookie,
  createStateCookie,
  parseCookies,
  verifySessionCookie,
} from "../functions/_lib/session";
import type { Env } from "../functions/_lib/env";

const env: Env = {
  SESSION_SECRET: "test-session-secret-with-more-than-32-bytes",
};

describe("session cookies", () => {
  it("signs and verifies a session", async () => {
    const cookie = await createSessionCookie("Nishant-k-sagar", env, 3600);
    const value = cookie.split(";")[0].split("=")[1];
    const request = new Request("https://example.pages.dev/api/auth/session", {
      headers: { cookie: `cms_session=${value}` },
    });
    await expect(verifySessionCookie(request, env)).resolves.toEqual({
      login: "Nishant-k-sagar",
    });
  });

  it("rejects tampered cookies", async () => {
    const cookie = await createSessionCookie("Nishant-k-sagar", env, 3600);
    const value = cookie.split(";")[0].split("=")[1];
    // Change the first payload character. (The last signature character carries only 4 meaningful
    // bits, so altering it is occasionally a no-op and made this test flaky.)
    const tampered = `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
    const request = new Request("https://example.pages.dev/api/auth/session", {
      headers: { cookie: `cms_session=${tampered}` },
    });
    await expect(verifySessionCookie(request, env)).resolves.toBeNull();
  });

  it("sets hardened cookie flags", async () => {
    const cookie = await createSessionCookie("Nishant-k-sagar", env, 3600);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
  });

  it("uses a Lax OAuth state cookie so it survives the redirect back from GitHub", () => {
    const cookie = createStateCookie("abc");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("SameSite=Strict");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("parses cookies", () => {
    expect(
      parseCookies(
        new Request("https://example.com", {
          headers: { cookie: "a=1; b=hello%20world" },
        }),
      ),
    ).toEqual({ a: "1", b: "hello world" });
  });
});
