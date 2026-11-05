import { describe, expect, it } from "vitest";
import config from "../cms.config";
import {
  parseFrontmatter,
  serializeMarkdown,
  serializeFrontmatter,
} from "../shared/frontmatter";

const blog = config.collections.find(
  (collection) => collection.name === "blog",
)!;

describe("frontmatter", () => {
  it("serializes with fixed key order and quoted dates", () => {
    const output = serializeFrontmatter(
      {
        title: "Hello",
        date: "2024-10-01",
        tags: ["cms", "git"],
        status: "published",
        excerpt: "Short",
      },
      blog,
    );
    expect(output).toContain('title: "Hello"');
    // Must be quoted: an unquoted date is parsed as a Date object and the site schema (z.string()) rejects it.
    expect(output).toContain('date: "2024-10-01"');
    expect(output.indexOf("title:")).toBeLessThan(output.indexOf("date:"));
    expect(output).toContain('tags: ["cms", "git"]');
  });

  it("never writes an unquoted date, so the Astro schema accepts the file", () => {
    const output = serializeFrontmatter(
      { title: "x", date: "2026-04-09", updated: "2026-05-01" },
      blog,
    );
    expect(output).not.toMatch(/^(date|updated): \d{4}-\d{2}-\d{2}$/m);
    expect(output).toContain('date: "2026-04-09"');
    expect(output).toContain('updated: "2026-05-01"');
  });

  it("preserves unknown fields after known fields", () => {
    const output = serializeFrontmatter(
      { title: "Hello", date: "2024-10-01", pinned: true },
      blog,
    );
    expect(output).toContain("pinned: true");
    expect(output.indexOf("date:")).toBeLessThan(output.indexOf("pinned:"));
  });

  it("round-trips a representative blog file with no meaningful diff", () => {
    const raw = [
      "---",
      'title: "Hello there"',
      "date: 2024-10-01",
      'tags: ["cms", "git"]',
      'status: "published"',
      "pinned: true",
      'excerpt: "Short excerpt"',
      "---",
      "",
      "Body text.",
      "",
    ].join("\n");
    const parsed = parseFrontmatter(raw);
    expect(parsed.data.title).toBe("Hello there");
    expect(parsed.data.pinned).toBe(true);
    const serialized = serializeMarkdown(parsed.data, parsed.body, blog);
    expect(serialized).toContain('title: "Hello there"');
    expect(serialized).toContain('date: "2024-10-01"');
    expect(serialized).toContain("pinned: true");
    expect(serialized.endsWith("Body text.\n")).toBe(true);
  });
});
