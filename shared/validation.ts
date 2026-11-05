import { z } from "zod";
import config from "../cms.config";
import { dateToYmd } from "./frontmatter";
import { isValidSlug } from "./slug";
import type { CollectionConfig, FieldConfig, FieldValue } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayYmd(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function resolveDefault(field: FieldConfig): FieldValue {
  if (field.default === undefined) return undefined;
  if (field.default === "today" && field.type === "date") return todayYmd();
  return field.default;
}

function asTrimmedString(value: FieldValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

function asStringList(value: FieldValue): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const items = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(","))
    : String(value).split(",");
  const cleaned = [
    ...new Set(items.map((item) => item.trim()).filter(Boolean)),
  ];
  return cleaned.length ? cleaned : [];
}

function asNumber(value: FieldValue): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(num) ? num : Number.NaN;
}

function asBoolean(value: FieldValue): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return undefined;
}

export interface ValidationResult {
  success: boolean;
  data: Record<string, FieldValue>;
  unknownFields: string[];
  errors: Record<string, string>;
}

function validateField(
  field: FieldConfig,
  raw: FieldValue,
  strict: boolean,
  errors: Record<string, string>,
): FieldValue {
  const label = field.label ?? field.name;
  let value = raw;

  if (value === undefined || value === null || value === "") {
    const fallback = resolveDefault(field);
    if (fallback !== undefined) return fallback;
    if (strict && field.required) errors[field.name] = `${label} is required.`;
    return undefined;
  }

  switch (field.type) {
    case "string":
    case "text":
    case "markdown": {
      const text = asTrimmedString(value);
      if (!text) {
        if (strict && field.required)
          errors[field.name] = `${label} is required.`;
        return undefined;
      }
      if (field.max && text.length > field.max) {
        errors[field.name] =
          `${label} must be ${field.max} characters or fewer.`;
      }
      return text;
    }
    case "url": {
      const text = asTrimmedString(value);
      if (!text) {
        if (strict && field.required)
          errors[field.name] = `${label} is required.`;
        return undefined;
      }
      if (field.max && text.length > field.max)
        errors[field.name] =
          `${label} must be ${field.max} characters or fewer.`;
      try {
        const url = new URL(text);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          errors[field.name] = `${label} must start with http:// or https://.`;
        }
      } catch {
        errors[field.name] = `${label} must be a valid URL.`;
      }
      return text;
    }
    case "date": {
      const text = dateToYmd(value);
      if (!text || !isRealDate(text)) {
        errors[field.name] =
          `${label} must be a real date in YYYY-MM-DD format.`;
        return undefined;
      }
      return text;
    }
    case "boolean": {
      const bool = asBoolean(value);
      if (bool === undefined) {
        errors[field.name] = `${label} must be true or false.`;
        return undefined;
      }
      return bool;
    }
    case "number": {
      const num = asNumber(value);
      if (num === undefined || Number.isNaN(num)) {
        errors[field.name] = `${label} must be a number.`;
        return undefined;
      }
      if (field.min !== undefined && num < field.min)
        errors[field.name] = `${label} must be at least ${field.min}.`;
      if (field.max !== undefined && num > field.max)
        errors[field.name] = `${label} must be at most ${field.max}.`;
      return num;
    }
    case "select": {
      const text = asTrimmedString(value);
      if (!text) {
        if (strict && field.required)
          errors[field.name] = `${label} is required.`;
        return undefined;
      }
      if (field.options && !field.options.includes(text)) {
        errors[field.name] =
          `${label} must be one of: ${field.options.join(", ")}.`;
        return undefined;
      }
      return text;
    }
    case "list": {
      const list = asStringList(value);
      if (!list || list.length === 0) {
        if (strict && field.required)
          errors[field.name] =
            `${label} requires at least ${field.min ?? 1} item.`;
        return list ?? undefined;
      }
      if (field.min !== undefined && list.length < field.min) {
        errors[field.name] =
          `${label} requires at least ${field.min} item${field.min === 1 ? "" : "s"}.`;
      }
      if (field.max !== undefined && list.length > field.max) {
        errors[field.name] = `${label} allows at most ${field.max} items.`;
      }
      return list;
    }
  }
}

export function validateFields(
  collection: CollectionConfig,
  input: Record<string, FieldValue>,
  mode: "draft" | "publish",
): ValidationResult {
  const strict = mode === "publish";
  const errors: Record<string, string> = {};
  const data: Record<string, FieldValue> = {};
  const knownNames = new Set(collection.fields.map((field) => field.name));
  const unknownFields = Object.keys(input)
    .filter((key) => !knownNames.has(key) && key !== "body")
    .sort((a, b) => a.localeCompare(b));

  for (const field of collection.fields) {
    const value = validateField(field, input[field.name], strict, errors);
    if (value !== undefined) data[field.name] = value;
  }

  if (strict) {
    for (const field of collection.fields) {
      if (
        field.required &&
        data[field.name] === undefined &&
        input[field.name] === undefined
      ) {
        errors[field.name] = `${field.label ?? field.name} is required.`;
      }
    }
  } else {
    const title = asTrimmedString(data.title);
    if (!title) errors.title = "Title is required to save a draft.";
  }

  const slugOverride = asTrimmedString(input.slug);
  if (slugOverride && !isValidSlug(slugOverride)) {
    errors.slug =
      "Slug must be lowercase ASCII words separated by single hyphens.";
  }

  for (const key of unknownFields) {
    data[key] = input[key];
  }

  return {
    success: Object.keys(errors).length === 0,
    data,
    unknownFields,
    errors,
  };
}

export function getCollection(name: string): CollectionConfig {
  const collection = config.collections.find((item) => item.name === name);
  if (!collection) throw new Error(`Unknown collection: ${name}`);
  return collection;
}

export function publicConfig() {
  return {
    siteUrl: config.siteUrl,
    repo: {
      owner: config.repo.owner,
      name: config.repo.name,
      branch: config.repo.branch,
    },
    media: config.media,
    collections: config.collections,
  };
}

export const fieldSchemas = {
  string: z.string(),
  url: z.string().url(),
  date: z.string().regex(DATE_RE).refine(isRealDate),
};
