import { describe, expect, it } from "vitest";
import config from "../cms.config";
import { parseFrontmatter, serializeMarkdown } from "../shared/frontmatter";
import type { FieldConfig, FieldValue } from "../shared/types";

function sampleFor(field: FieldConfig): FieldValue {
  if (field.default !== undefined && field.default !== "today")
    return field.default;
  switch (field.type) {
    case "date":
      return "2024-10-01";
    case "boolean":
      return false;
    case "number":
      return 1;
    case "select":
      return field.options?.[0] ?? "published";
    case "list":
      return ["cms"];
    case "url":
      return "https://example.com/";
    case "text":
      return "A sufficiently useful excerpt for validation and round-tripping.";
    default:
      return `Sample ${field.name}`;
  }
}

describe("portfolio content round-trip fixtures", () => {
  for (const collection of config.collections) {
    it(`round-trips ${collection.name}`, () => {
      const data: Record<string, FieldValue> = {};
      for (const field of collection.fields) {
        if (field.required || field.name === "status")
          data[field.name] = sampleFor(field);
      }
      if (collection.name === "pages") data.title = "Now";
      const raw = serializeMarkdown(data, "Body copy.", collection);
      const parsed = parseFrontmatter(raw);
      const serializedAgain = serializeMarkdown(
        parsed.data,
        parsed.body,
        collection,
      );
      expect(serializedAgain).toBe(raw);
    });
  }
});
