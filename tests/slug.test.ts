import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "../shared/slug";
import { readingStats } from "../shared/readingTime";

describe("slugify", () => {
  it("creates lowercase hyphenated slugs", () => {
    expect(slugify("Hello, World! This is CMS")).toBe(
      "hello-world-this-is-cms",
    );
    expect(slugify("  Café— déjà vu  ")).toBe("cafe-deja-vu");
    expect(slugify("already-good-123")).toBe("already-good-123");
  });

  it("validates slug rules", () => {
    expect(isValidSlug("hello-world")).toBe(true);
    expect(isValidSlug("Hello-world")).toBe(false);
    expect(isValidSlug("hello..world")).toBe(false);
    expect(isValidSlug("-hello")).toBe(false);
    expect(isValidSlug("a".repeat(121))).toBe(false);
  });
});

describe("readingStats", () => {
  it("counts words without code blocks dominating the estimate", () => {
    expect(readingStats("one two three")).toEqual({ words: 3, minutes: 1 });
    expect(readingStats("word\n\n```\ncode words words words\n```").words).toBe(
      1,
    );
  });
});
