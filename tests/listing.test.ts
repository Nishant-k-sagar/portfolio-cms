import { afterEach, describe, expect, it, vi } from "vitest";
import { listEntries } from "../functions/_lib/content";
import type { Env } from "../functions/_lib/env";

const env: Env = { GITHUB_WRITE_TOKEN: "test-token" };

type Tree = Array<{ name: string; text: string; oid: string }>;

function post(title: string, date: string): string {
  return `---\ntitle: "${title}"\ndate: "${date}"\nstatus: "published"\n---\n\nBody\n`;
}

// What GitHub would return for each "<branch>:<folder>" the code asks for.
const trees: Record<string, Tree> = {
  "main:src/content/blog": [
    {
      name: "alpha.md",
      text: post("Alpha", "2026-01-01"),
      oid: "sha-alpha-main",
    },
    {
      name: "Legacy-Name.md",
      text: post("Legacy", "2025-01-01"),
      oid: "sha-legacy",
    },
    {
      name: "stale.md",
      text: post("Stale (current)", "2026-03-03"),
      oid: "sha-stale-main",
    },
  ],
  "cms-drafts:src/content/blog": [
    {
      name: "alpha.md",
      text: post("Alpha edited", "2026-01-01"),
      oid: "sha-alpha-draft",
    },
    {
      name: "brand-new.md",
      text: post("Brand new", "2026-02-02"),
      oid: "sha-new",
    },
    // Leftover copy from when the branch was created: no metadata, so it is NOT a draft.
    {
      name: "stale.md",
      text: post("Stale (old copy)", "2026-03-03"),
      oid: "sha-stale-old",
    },
  ],
  "cms-drafts:.cms/blog": [
    {
      name: "alpha.json",
      text: JSON.stringify({
        baseSha: "sha-alpha-main",
        savedAt: "2026-02-03T10:00:00.000Z",
      }),
      oid: "sha-meta-alpha",
    },
    {
      name: "brand-new.json",
      text: JSON.stringify({
        baseSha: "",
        savedAt: "2026-02-02T10:00:00.000Z",
      }),
      oid: "sha-meta",
    },
  ],
};

function stubGitHub(): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        variables: Record<string, string>;
      };
      const repository: Record<string, unknown> = {};
      Object.entries(body.variables)
        .filter(([key]) => key.startsWith("e"))
        .forEach(([key, expression]) => {
          const tree = trees[expression];
          repository[`f${key.slice(1)}`] = tree
            ? {
                entries: tree.map((file) => ({
                  name: file.name,
                  type: "blob",
                  oid: file.oid,
                  object: { text: file.text },
                })),
              }
            : null;
        });
      return new Response(JSON.stringify({ data: { repository } }), {
        status: 200,
      });
    }),
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("listEntries", () => {
  it("lists every collection with a single GitHub request", async () => {
    const { calls } = stubGitHub();
    await listEntries(env);
    // Workers on the free plan allow ~50 outgoing requests; listing must not scale with file count.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/graphql");
  });

  it("derives draft, published and published-with-changes states", async () => {
    stubGitHub();
    const blog = await listEntries(env, "blog");
    const state = Object.fromEntries(blog.map((e) => [e.slug, e.state]));
    expect(state["alpha"]).toBe("published-with-changes");
    expect(state["brand-new"]).toBe("draft");
    expect(blog.find((e) => e.slug === "brand-new")?.updatedAt).toBe(
      "2026-02-02T10:00:00.000Z",
    );
    expect(blog.find((e) => e.slug === "alpha")?.title).toBe("Alpha edited");
  });

  it("still lists legacy files whose names break the slug rules", async () => {
    stubGitHub();
    const blog = await listEntries(env, "blog");
    const legacy = blog.find((e) => e.slug === "Legacy-Name");
    expect(legacy?.title).toBe("Legacy");
    expect(legacy?.state).toBe("published");
  });

  it("ignores stale copies on the drafts branch that have no draft metadata", async () => {
    stubGitHub();
    const blog = await listEntries(env, "blog");
    const stale = blog.find((e) => e.slug === "stale");
    expect(stale?.state).toBe("published");
    // It must show the current live text, not the old leftover copy.
    expect(stale?.title).toBe("Stale (current)");
    expect(stale?.draftSha).toBeUndefined();
  });
});
