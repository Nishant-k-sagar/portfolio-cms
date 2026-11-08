import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { CollectionConfig, FieldValue } from "./types";

export interface ParsedMarkdown {
  data: Record<string, FieldValue>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_LIKE = /^\d{4}-(0[1-9]|1[0-2])$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateToYmd(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_LIKE.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
    }
  }
  return undefined;
}

export function monthToYm(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (MONTH_LIKE.test(trimmed)) return trimmed;
  }
  return undefined;
}

function normalizeValue(value: unknown): FieldValue {
  if (value instanceof Date) return dateToYmd(value) ?? "";
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeData(data: unknown): Record<string, FieldValue> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    out[key] = normalizeValue(value);
  }
  return out;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: raw.replace(/^\uFEFF/, "") };
  const parsed = parseYaml(match[1]);
  return { data: normalizeData(parsed), body: match[2].replace(/^\r?\n/, "") };
}

function formatScalar(value: string | number | boolean): string {
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  // Always quote strings, including dates. An unquoted `2026-04-09` is parsed by YAML as a
  // Date object, and the portfolio schema (`date: z.string()`) rejects it, failing the build.
  return JSON.stringify(value);
}

function formatValue(value: FieldValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatScalar(String(item))).join(", ")}]`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return formatScalar(value);
}

function orderedFrontmatterKeys(
  data: Record<string, FieldValue>,
  collection: CollectionConfig,
): string[] {
  const known = collection.fields
    .map((field) => field.name)
    .filter((name) => name !== "body");
  const presentKnown = known.filter((name) =>
    Object.prototype.hasOwnProperty.call(data, name),
  );
  const knownSet = new Set(known);
  const unknown = Object.keys(data)
    .filter((key) => !knownSet.has(key))
    .sort((a, b) => a.localeCompare(b));
  return [...presentKnown, ...unknown];
}

export function serializeFrontmatter(
  data: Record<string, FieldValue>,
  collection: CollectionConfig,
): string {
  const lines = ["---"];
  for (const key of orderedFrontmatterKeys(data, collection)) {
    const formatted = formatValue(data[key]);
    if (formatted === undefined) continue;
    lines.push(`${key}: ${formatted}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

export function serializeMarkdown(
  data: Record<string, FieldValue>,
  body: string,
  collection: CollectionConfig,
): string {
  const cleanBody = body.replace(/^\r?\n/, "").replace(/\s+$/u, "");
  return `${serializeFrontmatter(data, collection)}\n${cleanBody}\n`;
}

export function fallbackYaml(data: unknown): string {
  return stringifyYaml(data);
}
