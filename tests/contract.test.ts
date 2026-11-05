import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../cms.config";

const configuredPath = process.env.PORTFOLIO_CONTENT_CONFIG;
const portfolioPath = configuredPath ? path.resolve(configuredPath) : undefined;
const describeContract = portfolioPath ? describe : describe.skip;

function extractCollectionBlock(schema: string, name: string): string {
  const match = schema.match(
    new RegExp(`const ${name} = defineCollection\\(\\{([\\s\\S]*?)\\n\\}\\);`),
  );
  if (!match)
    throw new Error(`Could not find collection "${name}" in portfolio schema.`);
  return match[1];
}

function extractSchemaObject(block: string, name: string): string {
  const match = block.match(/schema:\s*z\.object\(\{([\s\S]*?)\}\)/);
  if (!match) throw new Error(`Could not find z.object schema for "${name}".`);
  return match[1];
}

function extractFieldNames(fieldsBlock: string): string[] {
  return [...fieldsBlock.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm)].map(
    (match) => match[1],
  );
}

function fieldLine(fieldsBlock: string, field: string): string {
  const match = fieldsBlock.match(new RegExp(`^\\s*${field}:.*$`, "m"));
  return match?.[0] ?? "";
}

function isPortfolioOptional(fieldsBlock: string, field: string): boolean {
  const line = fieldLine(fieldsBlock, field);
  return /\.optional\s*\(/.test(line) || /\.default\s*\(/.test(line);
}

function extractEnumValues(fieldsBlock: string, field: string): string[] {
  const match = fieldsBlock.match(
    new RegExp(`${field}:\\s*z\\.enum\\(\\[([^\\]]+)\\]\\)`),
  );
  if (!match) return [];
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

let cachedSchema: string | undefined;
function getSchema(): string {
  if (!portfolioPath) throw new Error("PORTFOLIO_CONTENT_CONFIG is not set.");
  if (!existsSync(portfolioPath))
    throw new Error(`Portfolio schema not found at ${portfolioPath}`);
  cachedSchema ??= readFileSync(portfolioPath, "utf8");
  return cachedSchema;
}

describeContract("portfolio content schema contract", () => {
  it("uses an existing portfolio schema file", () => {
    expect(portfolioPath && existsSync(portfolioPath)).toBe(true);
  });

  for (const collection of config.collections) {
    it(`matches ${collection.name} field names`, () => {
      const block = extractCollectionBlock(getSchema(), collection.name);
      const fieldsBlock = extractSchemaObject(block, collection.name);
      const portfolioFields = extractFieldNames(fieldsBlock);
      const cmsFields = collection.fields.map((field) => field.name);
      expect(sorted(cmsFields)).toEqual(sorted(portfolioFields));
    });

    it(`matches ${collection.name} required flags`, () => {
      const block = extractCollectionBlock(getSchema(), collection.name);
      const fieldsBlock = extractSchemaObject(block, collection.name);
      const portfolioRequired = extractFieldNames(fieldsBlock).filter(
        (field) => !isPortfolioOptional(fieldsBlock, field),
      );
      const cmsRequired = collection.fields
        .filter((field) => field.required)
        .map((field) => field.name);
      expect(sorted(cmsRequired)).toEqual(sorted(portfolioRequired));
    });

    it(`keeps ${collection.name} enum options compatible`, () => {
      const block = extractCollectionBlock(getSchema(), collection.name);
      const fieldsBlock = extractSchemaObject(block, collection.name);
      for (const field of collection.fields) {
        if (field.type !== "select") continue;
        const portfolioOptions = extractEnumValues(fieldsBlock, field.name);
        expect(
          portfolioOptions,
          `${collection.name}.${field.name} is not a portfolio enum`,
        ).not.toHaveLength(0);
        for (const option of field.options ?? []) {
          expect(portfolioOptions).toContain(option);
        }
      }
    });
  }
});

describe("contract test configuration", () => {
  it("documents how to enable the strict contract test", () => {
    expect(
      portfolioPath ??
        "Set PORTFOLIO_CONTENT_CONFIG to the portfolio src/content.config.ts, for example C:\\Personal\\nishant-k-sagar.github.io\\src\\content.config.ts",
    ).toBeTruthy();
  });
});
