import config from "../../cms.config";
import { parseFrontmatter, serializeMarkdown } from "../../shared/frontmatter";
import { isValidSlug } from "../../shared/slug";
import { validateFields } from "../../shared/validation";
import type {
  CollectionConfig,
  FieldValue,
  EntrySummary,
  EntryState,
} from "../../shared/types";
import type { Env } from "./env";
import { GitHubClient, base64ToUtf8, utf8ToBase64 } from "./github";
import { HttpError } from "./http";
import {
  assertMediaPath,
  assertSlugParam,
  contentPath,
  mediaPrefix,
  metadataPath,
} from "./pathGuard";

export interface PendingImage {
  path: string;
  contentBase64: string;
}

export interface SaveDraftInput {
  fields: Record<string, FieldValue>;
  body: string;
  expectedDraftSha?: string | null;
  images?: PendingImage[];
}

export interface DraftMetadata {
  baseSha: string;
  savedAt: string;
  collection: string;
  slug: string;
  source: "portfolio-cms";
}

export interface SavedDraft {
  state: "draft";
  slug: string;
  collection: string;
  sha: string;
  baseSha: string;
  savedAt: string;
  unknownFields: string[];
  markdown: string;
}

export interface PublishedResult {
  ok: true;
  collection: string;
  slug: string;
  title: string;
  commitUrl: string;
  cleanupWarning?: string;
}

export function assertCollection(name: string): CollectionConfig {
  const collection = config.collections.find((item) => item.name === name);
  if (!collection) throw new HttpError(404, "not_found", "Unknown collection.");
  return collection;
}

function unknownFields(
  data: Record<string, FieldValue>,
  collection: CollectionConfig,
): string[] {
  const known = new Set(collection.fields.map((field) => field.name));
  return Object.keys(data)
    .filter((key) => !known.has(key) && key !== "body")
    .sort((a, b) => a.localeCompare(b));
}

async function readJsonFile<T>(
  client: GitHubClient,
  path: string,
  branch: string,
): Promise<T | null> {
  const file = await client.getFileIfExists(path, branch);
  if (!file) return null;
  try {
    return JSON.parse(base64ToUtf8(file.content)) as T;
  } catch {
    return null;
  }
}

function validatePendingImages(
  collection: CollectionConfig,
  slug: string,
  images: PendingImage[] = [],
): PendingImage[] {
  if (images.length > 8) {
    throw new HttpError(
      413,
      "payload_too_large",
      "Save at most 8 images with a draft.",
    );
  }
  const prefix = mediaPrefix(collection.name, slug);
  let totalBytes = 0;
  return images
    .map((image) => {
      const path = assertMediaPath(image.path);
      if (!path.startsWith(prefix)) {
        throw new HttpError(
          400,
          "bad_path",
          "Image path does not match this draft.",
        );
      }
      if (
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.contentBase64.replace(/\s/g, ""))
      ) {
        throw new HttpError(
          400,
          "bad_media_content",
          "Image content must be base64.",
        );
      }
      const bytes = Math.floor(
        image.contentBase64.replace(/\s/g, "").length * 0.75,
      );
      totalBytes += bytes;
      if (bytes > config.media.maxBytes) {
        throw new HttpError(
          413,
          "payload_too_large",
          "Each image must be 5 MB or smaller.",
        );
      }
      return { path, contentBase64: image.contentBase64.replace(/\s/g, "") };
    })
    .map((image) => {
      if (totalBytes > 12 * 1024 * 1024) {
        throw new HttpError(
          413,
          "payload_too_large",
          "Images attached to one draft must total 12 MB or less.",
        );
      }
      return image;
    });
}

function entryBase(collection: CollectionConfig, slug: string) {
  return {
    contentPath: contentPath(collection.name, slug),
    metadataPath: metadataPath(collection.name, slug),
    mediaPrefix: mediaPrefix(collection.name, slug),
  };
}

export async function saveDraft(
  env: Env,
  collectionName: string,
  slugParam: string,
  input: SaveDraftInput,
): Promise<SavedDraft> {
  const collection = assertCollection(collectionName);
  const slug = assertSlugParam(slugParam);
  if (typeof input.body !== "string") {
    throw new HttpError(
      400,
      "validation_failed",
      "Body must be a markdown string.",
      { body: "Body is required." },
    );
  }
  if (input.body.length > 1_000_000) {
    throw new HttpError(
      413,
      "payload_too_large",
      "Markdown body is too large.",
    );
  }
  const validation = validateFields(collection, input.fields ?? {}, "draft");
  if (!validation.success) {
    throw new HttpError(
      400,
      "validation_failed",
      "Fix the highlighted fields before saving.",
      validation.errors,
    );
  }

  const client = new GitHubClient(env);
  await client.ensureBranch(config.repo.draftsBranch, config.repo.branch);
  const paths = entryBase(collection, slug);
  const mainFile = await client.getFileIfExists(
    paths.contentPath,
    config.repo.branch,
  );
  const existingDraft = await client.getFileIfExists(
    paths.contentPath,
    config.repo.draftsBranch,
  );
  if (
    input.expectedDraftSha !== undefined &&
    (existingDraft?.sha ?? null) !== input.expectedDraftSha
  ) {
    throw new HttpError(
      409,
      "conflict",
      "This draft changed on GitHub. Reload before saving again.",
    );
  }

  const metadata = await readJsonFile<DraftMetadata>(
    client,
    paths.metadataPath,
    config.repo.draftsBranch,
  );
  const baseSha = metadata?.baseSha ?? mainFile?.sha ?? "";
  const savedAt = new Date().toISOString();
  const markdown = serializeMarkdown(validation.data, input.body, collection);
  const nextMetadata: DraftMetadata = {
    baseSha,
    savedAt,
    collection: collection.name,
    slug,
    source: "portfolio-cms",
  };

  const draftsHead = await client.getRef(config.repo.draftsBranch);
  const draftsCommit = await client.getCommit(draftsHead.object.sha);
  const entries: Array<{ path: string; sha: string }> = [];
  entries.push({
    path: paths.contentPath,
    sha: await client.createBlob(utf8ToBase64(markdown)),
  });
  entries.push({
    path: paths.metadataPath,
    sha: await client.createBlob(
      utf8ToBase64(JSON.stringify(nextMetadata, null, 2)),
    ),
  });

  const images = validatePendingImages(collection, slug, input.images ?? []);
  for (const image of images) {
    entries.push({
      path: image.path,
      sha: await client.createBlob(image.contentBase64),
    });
  }

  const title = String(validation.data.title ?? slug);
  const tree = await client.createTree(
    draftsCommit.tree.sha,
    entries.map((entry) => ({
      path: entry.path,
      type: "blob",
      sha: entry.sha,
    })),
  );
  const commit = await client.createCommit(
    `draft: save ${collection.name} "${title}"`,
    tree.sha,
    [draftsHead.object.sha],
  );
  await client.updateRef(config.repo.draftsBranch, commit.sha, false);

  console.log(
    JSON.stringify({
      level: "info",
      event: "draft_saved",
      collection: collection.name,
      slug,
      baseShaPresent: Boolean(baseSha),
      images: images.length,
    }),
  );
  return {
    state: "draft",
    slug,
    collection: collection.name,
    sha: entries[0].sha,
    baseSha,
    savedAt,
    unknownFields: validation.unknownFields,
    markdown,
  };
}

export async function listEntries(
  env: Env,
  collectionName?: string,
): Promise<EntrySummary[]> {
  const client = new GitHubClient(env);
  const collections = collectionName
    ? [assertCollection(collectionName)]
    : config.collections;
  const out: EntrySummary[] = [];
  for (const collection of collections) {
    out.push(...(await listCollection(client, collection)));
  }
  out.sort((a, b) => {
    const field = collections.length === 1 ? collections[0].sort.field : "date";
    const order = collections.length === 1 ? collections[0].sort.order : "desc";
    const av = String((a as unknown as Record<string, unknown>)[field] ?? "");
    const bv = String((b as unknown as Record<string, unknown>)[field] ?? "");
    return order === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  return out;
}

async function listCollection(
  client: GitHubClient,
  collection: CollectionConfig,
): Promise<EntrySummary[]> {
  const [mainFiles, draftFiles, metadataFiles] = await Promise.all([
    client.branchFiles(config.repo.branch, collection.folder),
    client.branchFiles(config.repo.draftsBranch, collection.folder),
    client.branchFiles(config.repo.draftsBranch, `.cms/${collection.name}`),
  ]);
  const mainMap = fileMap(mainFiles?.files ?? [], collection.folder);
  const draftMap = fileMap(draftFiles?.files ?? [], collection.folder);
  const metaShaMap = new Map(
    (metadataFiles?.files ?? []).map((file) => [
      slugFromPath(file.path),
      file.sha,
    ]),
  );

  const slugs = new Set([...mainMap.keys(), ...draftMap.keys()]);
  const summaries: EntrySummary[] = [];
  for (const slug of slugs) {
    const main = mainMap.get(slug);
    const draft = draftMap.get(slug);
    const meta = await readJsonFile<DraftMetadata>(
      client,
      metadataPath(collection.name, slug),
      config.repo.draftsBranch,
    );
    const chosen = draft ?? main;
    if (!chosen) continue;
    const raw = base64ToUtf8(
      (
        await client.getFile(
          chosen.path,
          draft ? config.repo.draftsBranch : config.repo.branch,
        )
      ).content,
    );
    const parsed = parseFrontmatter(raw);
    const data = parsed.data;
    let state: EntryState = "published";
    if (draft && !main) state = "draft";
    else if (draft && main)
      state = draft.sha === main.sha ? "published" : "published-with-changes";

    summaries.push({
      collection: collection.name,
      collectionLabel: collection.label,
      slug,
      title: String(data.title ?? slug),
      date: typeof data.date === "string" ? data.date : undefined,
      status: typeof data.status === "string" ? data.status : undefined,
      state,
      updatedAt: meta?.savedAt,
      sha: main?.sha ?? undefined,
      draftSha: draft?.sha ?? undefined,
      baseSha: meta?.baseSha,
      unknownFields: unknownFields(data, collection),
    });
    void metaShaMap;
  }
  return summaries;
}

function fileMap(
  files: Array<{ path: string; sha: string | null }>,
  folder: string,
): Map<string, { path: string; sha: string }> {
  const map = new Map<string, { path: string; sha: string }>();
  const prefix = `${folder}/`;
  for (const file of files) {
    if (
      !file.sha ||
      !file.path.startsWith(prefix) ||
      !file.path.endsWith(".md")
    )
      continue;
    if (file.path.slice(prefix.length).includes("/")) continue;
    map.set(slugFromPath(file.path), { path: file.path, sha: file.sha });
  }
  return map;
}

function slugFromPath(path: string): string {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.md$/, "")
      .replace(/\.json$/, "") ?? ""
  );
}

export async function getEntry(
  env: Env,
  collectionName: string,
  slugParam: string,
  source?: string,
): Promise<Record<string, unknown>> {
  const collection = assertCollection(collectionName);
  const slug = assertSlugParam(slugParam);
  const path = contentPath(collection.name, slug);
  const client = new GitHubClient(env);
  const chosenSource =
    source === "draft" || source === "main"
      ? source
      : await (async () => {
          const draft = await client
            .getFileIfExists(path, config.repo.draftsBranch)
            .catch(() => null);
          return draft ? "draft" : "main";
        })();

  const file = await client.getFileIfExists(
    path,
    chosenSource === "draft" ? config.repo.draftsBranch : config.repo.branch,
  );
  if (!file) throw new HttpError(404, "not_found", "Entry was not found.");
  const meta =
    chosenSource === "draft"
      ? await readJsonFile<DraftMetadata>(
          client,
          metadataPath(collection.name, slug),
          config.repo.draftsBranch,
        )
      : null;
  const parsed = parseFrontmatter(base64ToUtf8(file.content));
  let state: EntryState = "published";
  if (chosenSource === "draft") {
    const mainFile = await client.getFileIfExists(path, config.repo.branch);
    state = mainFile
      ? mainFile.sha === file.sha
        ? "published"
        : "published-with-changes"
      : "draft";
  }
  return {
    collection: collection.name,
    slug,
    source: chosenSource,
    state,
    sha: file.sha,
    baseSha: meta?.baseSha ?? null,
    savedAt: meta?.savedAt ?? null,
    fields: parsed.data,
    unknownFields: unknownFields(parsed.data, collection),
    body: parsed.body,
    slugLocked: Boolean(collection.specialSlugLocked?.includes(slug)),
  };
}

export async function publishEntry(
  env: Env,
  collectionName: string,
  slugParam: string,
  overwrite = false,
): Promise<PublishedResult> {
  const collection = assertCollection(collectionName);
  const slug = assertSlugParam(slugParam);
  const path = contentPath(collection.name, slug);
  const metaPath = metadataPath(collection.name, slug);
  const client = new GitHubClient(env);

  const draftBranch = config.repo.draftsBranch;
  await client.getRef(draftBranch).catch(() => {
    throw new HttpError(
      404,
      "not_found",
      "No drafts branch exists yet. Save a draft first.",
    );
  });
  const draftFile = await client.getFileIfExists(path, draftBranch);
  if (!draftFile) throw new HttpError(404, "not_found", "Draft was not found.");
  const meta = await readJsonFile<DraftMetadata>(client, metaPath, draftBranch);

  const parsed = parseFrontmatter(base64ToUtf8(draftFile.content));
  const validation = validateFields(collection, parsed.data, "publish");
  if (!validation.success) {
    throw new HttpError(
      400,
      "validation_failed",
      "Fix the highlighted fields before publishing.",
      validation.errors,
    );
  }
  if (!isValidSlug(slug)) {
    throw new HttpError(400, "validation_failed", "Invalid slug.", {
      slug: "Invalid slug.",
    });
  }

  await assertSlugUnique(client, collection, slug, path);

  const mainRef = await client.getRef(config.repo.branch);
  const mainCommit = await client.getCommit(mainRef.object.sha);
  const mainFile = await client.getFileIfExists(path, config.repo.branch);
  const baseSha = meta?.baseSha ?? "";
  if (mainFile && !overwrite) {
    if (!baseSha || mainFile.sha !== baseSha) {
      throw new HttpError(
        409,
        "conflict",
        "The published file changed on GitHub since this draft was started. Reload the live version or overwrite it.",
      );
    }
  }

  const markdown = serializeMarkdown(validation.data, parsed.body, collection);
  const mainEntries: Array<{ path: string; sha: string | null }> = [
    { path, sha: await client.createBlob(utf8ToBase64(markdown)) },
  ];

  const draftTree = await client.branchFiles(
    draftBranch,
    mediaPrefix(collection.name, slug),
  );
  const imagePaths = (draftTree?.files ?? [])
    .filter((file) => file.sha)
    .map((file) => ({ path: file.path, sha: file.sha as string }));
  for (const image of imagePaths)
    mainEntries.push({ path: image.path, sha: image.sha });

  const verb = mainFile ? "update" : "publish";
  const title = String(validation.data.title ?? slug);
  const mainTree = await client.createTree(
    mainCommit.tree.sha,
    mainEntries.map((entry) => ({
      path: entry.path,
      type: "blob",
      sha: entry.sha as string,
    })),
  );
  const mainPublished = await client.createCommit(
    `content: ${verb} ${collection.name} "${title}"`,
    mainTree.sha,
    [mainRef.object.sha],
  );
  await client.updateRef(config.repo.branch, mainPublished.sha, false);

  let cleanupWarning: string | undefined;
  try {
    const latestDraftsRef = await client.getRef(draftBranch);
    const latestDraftsCommit = await client.getCommit(
      latestDraftsRef.object.sha,
    );
    const deletes = [
      path,
      metaPath,
      ...imagePaths.map((image) => image.path),
    ].map((deletePath) => ({
      path: deletePath,
      type: "blob" as const,
      sha: null,
    }));
    const draftTreeAfter = await client.createTree(
      latestDraftsCommit.tree.sha,
      deletes,
    );
    const cleanupCommit = await client.createCommit(
      `draft: remove ${collection.name} "${title}" after publish`,
      draftTreeAfter.sha,
      [latestDraftsRef.object.sha],
    );
    await client.updateRef(draftBranch, cleanupCommit.sha, false);
  } catch (error) {
    cleanupWarning =
      "Published, but the draft cleanup failed. The list view will treat identical drafts as published.";
    console.error(
      JSON.stringify({
        level: "error",
        event: "draft_cleanup_failed",
        collection: collection.name,
        slug,
        error: String(error),
      }),
    );
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "published",
      collection: collection.name,
      slug,
      verb,
      cleanup: cleanupWarning ? "failed" : "ok",
    }),
  );
  return {
    ok: true,
    collection: collection.name,
    slug,
    title,
    commitUrl: client.commitUrl(mainPublished.sha),
    cleanupWarning,
  };
}

async function assertSlugUnique(
  client: GitHubClient,
  collection: CollectionConfig,
  slug: string,
  currentPath: string,
): Promise<void> {
  for (const other of config.collections) {
    for (const branch of [config.repo.branch, config.repo.draftsBranch]) {
      const files = await client
        .branchFiles(branch, other.folder)
        .catch(() => null);
      for (const file of files?.files ?? []) {
        if (slugFromPath(file.path) !== slug) continue;
        if (file.path === currentPath) continue;
        if (
          other.name === collection.name &&
          branch === config.repo.draftsBranch &&
          file.path === currentPath
        )
          continue;
        throw new HttpError(
          400,
          "validation_failed",
          "That slug is already used somewhere else.",
          {
            slug: `Slug "${slug}" is already used by ${other.label} (${branch}).`,
          },
        );
      }
    }
  }
}
