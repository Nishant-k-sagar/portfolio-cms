import config from "../../cms.config";
import { isValidSlug } from "../../shared/slug";
import { HttpError } from "./http";

export function normalizeRepoPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.includes("\0"))
    throw new HttpError(400, "bad_path", "Path contains an invalid character.");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    throw new HttpError(400, "bad_path", "Absolute paths are not allowed.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) {
    throw new HttpError(400, "bad_path", "Path traversal is not allowed.");
  }
  return parts.filter(Boolean).join("/");
}

export function assertSlugParam(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new HttpError(
      400,
      "validation_failed",
      "Slug must be lowercase ASCII words separated by single hyphens.",
      {
        slug: "Invalid slug.",
      },
    );
  }
  return slug;
}

export function contentPath(collection: string, slug: string): string {
  const item = config.collections.find((entry) => entry.name === collection);
  if (!item) throw new HttpError(404, "not_found", "Unknown collection.");
  assertSlugParam(slug);
  return normalizeRepoPath(`${item.folder}/${slug}.md`);
}

export function metadataPath(collection: string, slug: string): string {
  const item = config.collections.find((entry) => entry.name === collection);
  if (!item) throw new HttpError(404, "not_found", "Unknown collection.");
  assertSlugParam(slug);
  return normalizeRepoPath(`.cms/${item.name}/${slug}.json`);
}

export function mediaPrefix(collection: string, slug: string): string {
  const item = config.collections.find((entry) => entry.name === collection);
  if (!item) throw new HttpError(404, "not_found", "Unknown collection.");
  assertSlugParam(slug);
  return normalizeRepoPath(`${config.media.folder}/${item.name}/${slug}/`);
}

export function assertMediaPath(path: string): string {
  const normalized = normalizeRepoPath(path);
  const prefix = `${config.media.folder}/`;
  if (!normalized.startsWith(prefix)) {
    throw new HttpError(
      400,
      "bad_path",
      "Media path must be under the configured images folder.",
    );
  }
  const ext = normalized.split(".").pop()?.toLowerCase() ?? "";
  if (
    !config.media.allowedExtensions.includes(ext === "jpeg" ? "jpg" : ext) &&
    ext !== "jpeg"
  ) {
    throw new HttpError(
      400,
      "bad_media_type",
      "File extension is not allowed for media.",
    );
  }
  return normalized;
}

export function sanitizeMediaFileName(name: string): string {
  const parts = name.replace(/\\/g, "/").split("/");
  const base = parts[parts.length - 1] || "image";
  const dot = base.lastIndexOf(".");
  const rawName = dot === -1 ? base : base.slice(0, dot);
  const rawExt = dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt.replace(/[^a-z0-9]/g, "");
  const stem =
    rawName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 60) || "image";
  if (!ext || !config.media.allowedExtensions.includes(ext)) {
    throw new HttpError(
      400,
      "bad_media_type",
      "File extension is not allowed for media.",
    );
  }
  return `${stem}.${ext}`;
}

export function assertWritableRepoPath(path: string): string {
  const normalized = normalizeRepoPath(path);
  const allowed =
    normalized.startsWith("src/content/") ||
    normalized.startsWith(`${config.media.folder}/`) ||
    normalized.startsWith(".cms/");
  if (!allowed) {
    throw new HttpError(
      400,
      "bad_path",
      "This path cannot be written by the CMS.",
    );
  }
  return normalized;
}
