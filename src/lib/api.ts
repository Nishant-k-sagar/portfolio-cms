import type {
  EntryDocument,
  EntrySummary,
  FieldValue,
} from "../../shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-requested-with", "portfolio-cms");
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = (
      data as {
        error?: {
          code?: string;
          message?: string;
          fields?: Record<string, string>;
        };
      }
    ).error;
    throw new ApiError(
      response.status,
      error?.code ?? "error",
      error?.message ?? "Request failed.",
      error?.fields,
    );
  }
  return data as T;
}

export interface PublicConfig {
  siteUrl: string;
  repo: { owner: string; name: string; branch: string };
  media: {
    folder: string;
    publicPath: string;
    maxWidth: number;
    convertToWebp: string[];
    maxBytes: number;
    allowedExtensions: string[];
  };
  collections: Array<import("../../shared/types").CollectionConfig>;
}

export const getSession = () => api<{ login: string }>("/api/auth/session");
export const getConfig = () => api<PublicConfig>("/api/config");
export const listContent = (collection: string) =>
  api<{ entries: EntrySummary[] }>(
    `/api/content/${encodeURIComponent(collection)}`,
  );
export const listDrafts = () => api<{ drafts: EntrySummary[] }>("/api/drafts");
export const getEntry = (
  collection: string,
  slug: string,
  source?: "draft" | "main",
) =>
  api<
    EntryDocument & {
      baseSha: string | null;
      savedAt: string | null;
      slugLocked: boolean;
    }
  >(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}${source ? `?source=${source}` : ""}`,
  );
export const saveDraft = (
  collection: string,
  slug: string,
  payload: {
    fields: Record<string, FieldValue>;
    body: string;
    expectedDraftSha: string | null;
    images?: Array<{ path: string; contentBase64: string }>;
  },
) =>
  api<{
    state: "draft";
    sha: string;
    baseSha: string;
    savedAt: string;
    unknownFields: string[];
    markdown: string;
  }>(
    `/api/drafts/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
export const publishDraft = (
  collection: string,
  slug: string,
  overwrite = false,
) =>
  api<{ ok: true; commitUrl: string; title: string; cleanupWarning?: string }>(
    `/api/publish/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}`,
    { method: "POST", body: JSON.stringify({ overwrite }) },
  );
export const deleteEntry = (
  collection: string,
  slug: string,
  scope: "draft" | "all",
) =>
  api<{ ok: true; commitUrl?: string }>(
    `/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(slug)}?scope=${scope}`,
    { method: "DELETE" },
  );
export const uploadMedia = (payload: {
  collection: string;
  slug: string;
  name: string;
  alt: string;
  contentBase64: string;
}) =>
  api<{ ok: true; publicPath: string; markdown: string }>("/api/media", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const getDeployStatus = () =>
  api<{
    status: string;
    conclusion: string | null;
    url: string;
    name: string;
    createdAt: string;
  }>("/api/deploy/status");
export const logout = () =>
  api<{ ok: true }>("/api/auth/logout", { method: "POST", body: "{}" });
