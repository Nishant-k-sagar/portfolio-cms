import { describe, expect, it } from "vitest";
import config from "../cms.config";
import {
  getCollection,
  isRealDate,
  isRealMonth,
  validateFields,
} from "../shared/validation";

const validBlog = {
  title: "A valid post",
  date: "2024-10-01",
  tags: ["astro"],
  excerpt: "A short excerpt that is long enough.",
  status: "published",
};

describe("isRealDate", () => {
  it("rejects impossible dates", () => {
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2023-02-29")).toBe(false);
    expect(isRealDate("2024-13-01")).toBe(false);
  });
});

describe("isRealMonth", () => {
  it("accepts YYYY-MM months and rejects bad months and full dates", () => {
    expect(isRealMonth("2024-01")).toBe(true);
    expect(isRealMonth("2024-12")).toBe(true);
    expect(isRealMonth("2024-13")).toBe(false);
    expect(isRealMonth("2024-00")).toBe(false);
    expect(isRealMonth("2024-01-01")).toBe(false);
    expect(isRealMonth("2024-1")).toBe(false);
  });
});

describe("validateFields", () => {
  const blog = getCollection("blog");

  it("allows incomplete drafts with only a title", () => {
    const result = validateFields(blog, { title: "Draft only" }, "draft");
    expect(result.success).toBe(true);
  });

  it("requires a title for drafts", () => {
    const result = validateFields(blog, {}, "draft");
    expect(result.success).toBe(false);
    expect(result.errors.title).toBeTruthy();
  });

  it("requires publish fields and valid URLs", () => {
    const result = validateFields(
      blog,
      { ...validBlog, canonical_url: "not a url" },
      "publish",
    );
    expect(result.success).toBe(false);
    expect(result.errors.canonical_url).toBeTruthy();
  });

  it("enforces excerpt length and tags min at publish time", () => {
    const result = validateFields(
      blog,
      { ...validBlog, excerpt: "x".repeat(301), tags: [] },
      "publish",
    );
    expect(result.success).toBe(false);
    expect(result.errors.excerpt).toBeTruthy();
    expect(result.errors.tags).toBeTruthy();
  });

  it("preserves unknown fields", () => {
    const result = validateFields(
      blog,
      { ...validBlog, pinned: true },
      "publish",
    );
    expect(result.success).toBe(true);
    expect(result.data.pinned).toBe(true);
    expect(result.unknownFields).toContain("pinned");
  });

  it("applies defaults", () => {
    const result = validateFields(
      blog,
      { ...validBlog, status: undefined },
      "publish",
    );
    expect(result.data.status).toBe("published");
  });

  it("treats cover as a known field, not an unknown field", () => {
    const result = validateFields(
      blog,
      { ...validBlog, cover: "/images/cover.webp" },
      "publish",
    );
    expect(result.success).toBe(true);
    expect(result.data.cover).toBe("/images/cover.webp");
    expect(result.unknownFields).not.toContain("cover");
  });
});

describe("validateFields: experience", () => {
  const experience = getCollection("experience");

  it("validates month fields and rejects full dates and bad months", () => {
    const valid = validateFields(
      experience,
      {
        title: "Software Engineer",
        company: "Docstribe AI",
        start: "2024-01",
        end: "2024-12",
        status: "published",
      },
      "publish",
    );
    expect(valid.success).toBe(true);
    expect(valid.data.start).toBe("2024-01");

    for (const bad of ["2024-13", "2024-00", "2024-01-01", "2024-1"]) {
      const result = validateFields(
        experience,
        {
          title: "Software Engineer",
          company: "Docstribe AI",
          start: bad,
          status: "published",
        },
        "publish",
      );
      expect(result.success).toBe(false);
      expect(result.errors.start).toBeTruthy();
    }
  });

  it("requires title and company at publish time", () => {
    const result = validateFields(
      experience,
      { status: "published" },
      "publish",
    );
    expect(result.success).toBe(false);
    expect(result.errors.title).toBeTruthy();
    expect(result.errors.company).toBeTruthy();
  });
});

describe("config collections", () => {
  it("defines every collection the portfolio can be maintained from", () => {
    expect(config.collections.map((collection) => collection.name)).toEqual([
      "blog",
      "projects",
      "pages",
      "timeline",
      "skills",
      "socials",
      "home",
      "experience",
    ]);
  });
});
