import { describe, expect, it } from "vitest";
import {
  assertMediaPath,
  assertNewSlug,
  assertSlugParam,
  contentPath,
  metadataPath,
  normalizeRepoPath,
  sanitizeMediaFileName,
} from "../functions/_lib/pathGuard";
import { HttpError } from "../functions/_lib/http";

describe("path guard", () => {
  it("normalizes safe paths", () => {
    expect(normalizeRepoPath("src/content/blog/hello.md")).toBe(
      "src/content/blog/hello.md",
    );
    expect(contentPath("blog", "hello-world")).toBe(
      "src/content/blog/hello-world.md",
    );
    expect(metadataPath("blog", "hello-world")).toBe(
      ".cms/blog/hello-world.json",
    );
  });

  it("rejects traversal and absolute paths", () => {
    expect(() => normalizeRepoPath("../secrets.env")).toThrow(HttpError);
    expect(() => normalizeRepoPath("src/content/../../package.json")).toThrow(
      HttpError,
    );
    expect(() => normalizeRepoPath("/etc/passwd")).toThrow(HttpError);
    expect(() => contentPath("blog", "../x")).toThrow(HttpError);
  });

  it("validates media paths and file names", () => {
    expect(assertMediaPath("public/images/blog/post/hero.webp")).toBe(
      "public/images/blog/post/hero.webp",
    );
    expect(() => assertMediaPath("public/images/blog/post/file.php")).toThrow(
      HttpError,
    );
    expect(sanitizeMediaFileName("My Photo!!.JPEG")).toBe("my-photo.jpg");
  });

  it("lets existing files with legacy names open, but blocks path tricks", () => {
    expect(assertSlugParam("andro-goat-and-Android-studio")).toBe(
      "andro-goat-and-Android-studio",
    );
    for (const bad of [
      "../x",
      "a/b",
      "a.b",
      ".hidden",
      "",
      "a b",
      "x" + "\\" + "y",
    ]) {
      expect(() => assertSlugParam(bad)).toThrow(HttpError);
    }
  });

  it("holds brand-new entries to the strict slug rule", () => {
    expect(assertNewSlug("good-slug-2")).toBe("good-slug-2");
    expect(() => assertNewSlug("Android-studio")).toThrow(HttpError);
    expect(() => assertNewSlug("double--hyphen")).toThrow(HttpError);
    expect(() => assertNewSlug("under_score")).toThrow(HttpError);
  });
});
