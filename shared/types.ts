export type FieldType =
  | "string"
  | "text"
  | "date"
  | "boolean"
  | "number"
  | "select"
  | "list"
  | "url"
  | "markdown";

export type FieldValue =
  string | number | boolean | string[] | undefined | null;

export interface FieldConfig {
  name: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  options?: string[];
  default?: string | number | boolean;
  placeholder?: string;
  help?: string;
  rows?: number;
}

export interface CollectionConfig {
  name: string;
  label: string;
  folder: string;
  filename: string;
  sort: { field: string; order: "asc" | "desc" };
  listFields: string[];
  specialSlugLocked?: string[];
  fields: FieldConfig[];
}

export interface MediaConfig {
  folder: string;
  publicPath: string;
  maxWidth: number;
  convertToWebp: Array<"png" | "jpg">;
  maxBytes: number;
  allowedExtensions: string[];
}

export interface RepoConfig {
  owner: string;
  name: string;
  branch: string;
  draftsBranch: string;
}

export interface CmsConfig {
  repo: RepoConfig;
  allowList: string[];
  media: MediaConfig;
  collections: CollectionConfig[];
}

export type EntryState = "draft" | "published" | "published-with-changes";

export interface EntrySummary {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  date?: string;
  status?: string;
  state: EntryState;
  updatedAt?: string;
  sha?: string;
  draftSha?: string;
  baseSha?: string;
  unknownFields: string[];
}

export interface EntryDocument extends EntrySummary {
  fields: Record<string, FieldValue>;
  body: string;
  source: "main" | "draft";
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
