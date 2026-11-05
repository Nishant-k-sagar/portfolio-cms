import { afterEach, describe, expect, it, vi } from "vitest";
import { saveDraft } from "../functions/_lib/content";
import type { Env } from "../functions/_lib/env";

const env: Env = { GITHUB_WRITE_TOKEN: "test-token" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("saveDraft integration with mocked GitHub API", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("writes draft and metadata to cms-drafts only", async () => {
    let blobCounter = 0;
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });

        if (url.includes("/git/ref/heads/cms-drafts") && method === "GET") {
          return jsonResponse(200, {
            object: { sha: "draft-head", type: "commit" },
          });
        }
        if (url.includes("/git/commits/draft-head") && method === "GET") {
          return jsonResponse(200, {
            sha: "draft-head",
            tree: { sha: "draft-tree" },
            message: "old",
          });
        }
        if (url.includes("/contents/src/content/blog/test-post.md?ref=main")) {
          return jsonResponse(404, { message: "Not Found" });
        }
        if (
          url.includes("/contents/src/content/blog/test-post.md?ref=cms-drafts")
        ) {
          return jsonResponse(404, { message: "Not Found" });
        }
        if (url.includes("/contents/.cms/blog/test-post.json?ref=cms-drafts")) {
          return jsonResponse(404, { message: "Not Found" });
        }
        if (url.includes("/git/blobs") && method === "POST") {
          blobCounter += 1;
          return jsonResponse(201, { sha: `blob-${blobCounter}` });
        }
        if (url.includes("/git/trees") && method === "POST") {
          return jsonResponse(201, {
            sha: "new-tree",
            tree: [],
            truncated: false,
          });
        }
        if (url.includes("/git/commits") && method === "POST") {
          return jsonResponse(201, {
            sha: "new-commit",
            tree: { sha: "new-tree" },
            message: "draft",
          });
        }
        if (url.includes("/git/refs/heads/cms-drafts") && method === "PATCH") {
          return jsonResponse(200, {
            object: { sha: "new-commit", type: "commit" },
          });
        }
        throw new Error(`Unexpected fetch ${method} ${url}`);
      },
    ) as typeof fetch;

    const result = await saveDraft(env, "blog", "test-post", {
      fields: {
        title: "Test post",
        date: "2024-10-01",
        tags: ["test"],
        excerpt: "An excerpt long enough.",
        status: "published",
      },
      body: "Hello from the test.",
      expectedDraftSha: null,
    });

    expect(result.state).toBe("draft");
    expect(result.markdown).toContain('title: "Test post"');
    expect(
      calls.some(
        (call) =>
          call.url.includes("/git/refs/heads/main") && call.method === "PATCH",
      ),
    ).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.url.includes("/git/refs/heads/cms-drafts") &&
          call.method === "PATCH",
      ),
    ).toBe(true);
    const treeCall = calls.find(
      (call) => call.url.includes("/git/trees") && call.method === "POST",
    );
    expect(JSON.stringify(treeCall?.body)).toContain(
      ".cms/blog/test-post.json",
    );
  });
});
