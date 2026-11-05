import config from "../../cms.config";
import { assertCollection } from "../_lib/content";
import { requireCsrf } from "../_lib/csrf";
import { GitHubClient } from "../_lib/github";
import {
  clientIp,
  json,
  readJson,
  toErrorResponse,
  HttpError,
} from "../_lib/http";
import { mediaPrefix, sanitizeMediaFileName } from "../_lib/pathGuard";
import { requireSession } from "../_lib/session";
import { rateLimit } from "../_lib/rateLimit";
import type { Env } from "../_lib/env";

interface MediaBody {
  collection?: string;
  slug?: string;
  name?: string;
  alt?: string;
  contentBase64?: string;
}

const MAX_MEDIA_JSON_BYTES = 8 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    requireCsrf(request);
    rateLimit(`media-upload:${clientIp(request)}`, 30, 60_000);
    await requireSession(request, env);
    const body = await readJson<MediaBody>(request, MAX_MEDIA_JSON_BYTES);
    if (!body.collection || !body.slug || !body.name || !body.contentBase64) {
      throw new HttpError(
        400,
        "validation_failed",
        "collection, slug, name and contentBase64 are required.",
      );
    }
    if (!body.alt || !body.alt.trim()) {
      throw new HttpError(400, "validation_failed", "Alt text is required.", {
        alt: "Describe the image for screen readers.",
      });
    }
    const collection = assertCollection(body.collection);
    const cleanName = sanitizeMediaFileName(body.name);
    const path = `${mediaPrefix(collection.name, body.slug)}${Date.now().toString(36)}-${cleanName}`;
    const content = body.contentBase64.replace(/\s/g, "");
    const bytes = Math.floor(content.length * 0.75);
    if (bytes > config.media.maxBytes) {
      throw new HttpError(
        413,
        "payload_too_large",
        "Image must be 5 MB or smaller.",
      );
    }

    const client = new GitHubClient(env);
    await client.ensureBranch(config.repo.draftsBranch, config.repo.branch);
    const head = await client.getRef(config.repo.draftsBranch);
    const commit = await client.getCommit(head.object.sha);
    const blobSha = await client.createBlob(content);
    const tree = await client.createTree(commit.tree.sha, [
      { path, type: "blob", sha: blobSha },
    ]);
    const newCommit = await client.createCommit(
      `media: add ${cleanName} for ${collection.name}/${body.slug}`,
      tree.sha,
      [head.object.sha],
    );
    await client.updateRef(config.repo.draftsBranch, newCommit.sha, false);

    const publicPath = `${config.media.publicPath}/${collection.name}/${body.slug}/${path.split("/").pop()}`;
    console.log(
      JSON.stringify({
        level: "info",
        event: "media_uploaded",
        collection: collection.name,
        slug: body.slug,
        bytes,
      }),
    );
    return json({
      ok: true,
      path,
      publicPath,
      markdown: `![${body.alt.trim()}](${publicPath})`,
    });
  } catch (error) {
    return toErrorResponse(error, "Could not upload image.");
  }
};
