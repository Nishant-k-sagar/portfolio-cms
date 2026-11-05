import config from "../../cms.config";
import type { Env } from "./env";
import { requireEnv } from "./env";
import { HttpError } from "./http";
import { assertWritableRepoPath, normalizeRepoPath } from "./pathGuard";

export interface GitRef {
  object: { sha: string; type: string };
}

export interface GitCommit {
  sha: string;
  tree: { sha: string };
  message: string;
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string | null;
  size?: number;
}

export interface GitTree {
  sha: string;
  tree: GitTreeItem[];
  truncated: boolean;
}

export interface GitFile {
  path: string;
  sha: string;
  content: string;
  encoding: string;
  size: number;
}

export interface NewTreeEntry {
  path: string;
  mode?: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string | null;
}

export class GitHubClient {
  private repo: string;
  private token: string;

  constructor(env: Env) {
    this.repo = `${config.repo.owner}/${config.repo.name}`;
    this.token = requireEnv(env, "GITHUB_WRITE_TOKEN");
  }

  private async api<T>(
    path: string,
    init: RequestInit = {},
    okStatuses: number[] = [200, 201],
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/vnd.github+json");
    headers.set("authorization", `Bearer ${this.token}`);
    headers.set("user-agent", "portfolio-cms");
    headers.set("x-github-api-version", "2022-11-28");
    if (init.body && !headers.has("content-type"))
      headers.set("content-type", "application/json");

    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new HttpError(
        502,
        "upstream_error",
        "GitHub could not be reached. Try again later.",
      );
    }

    if (!okStatuses.includes(response.status)) {
      if (response.status === 404) {
        throw new HttpError(404, "not_found", "GitHub resource was not found.");
      }
      if (response.status === 409 || response.status === 422) {
        throw new HttpError(
          409,
          "conflict",
          "GitHub rejected the change because the branch moved. Refresh and try again.",
        );
      }
      if (response.status === 403 || response.status === 429) {
        throw new HttpError(
          429,
          "rate_limited",
          "GitHub rate limit reached. Try again later.",
        );
      }
      console.error(
        JSON.stringify({
          level: "error",
          message: "GitHub API request failed",
          status: response.status,
          path,
        }),
      );
      throw new HttpError(
        502,
        "upstream_error",
        "GitHub request failed. Try again later.",
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private gitRefPath(branch: string): string {
    return `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  }

  private gitRefsPath(branch: string): string {
    return `/repos/${this.repo}/git/refs/heads/${encodeURIComponent(branch)}`;
  }

  async getRef(branch: string): Promise<GitRef> {
    return this.api<GitRef>(this.gitRefPath(branch));
  }

  async createRef(branch: string, sha: string): Promise<GitRef> {
    return this.api<GitRef>(`/repos/${this.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });
  }

  async updateRef(branch: string, sha: string, force = false): Promise<GitRef> {
    return this.api<GitRef>(this.gitRefsPath(branch), {
      method: "PATCH",
      body: JSON.stringify({ sha, force }),
    });
  }

  async getCommit(sha: string): Promise<GitCommit> {
    return this.api<GitCommit>(
      `/repos/${this.repo}/git/commits/${encodeURIComponent(sha)}`,
    );
  }

  async getTree(treeSha: string, recursive = false): Promise<GitTree> {
    const query = recursive ? "?recursive=1" : "";
    return this.api<GitTree>(
      `/repos/${this.repo}/git/trees/${encodeURIComponent(treeSha)}${query}`,
    );
  }

  async getFile(path: string, ref: string): Promise<GitFile> {
    const normalized = assertWritableRepoPath(path);
    return this.api<GitFile>(
      `/repos/${this.repo}/contents/${normalized}?ref=${encodeURIComponent(ref)}`,
    );
  }

  async getFileIfExists(path: string, ref: string): Promise<GitFile | null> {
    try {
      return await this.getFile(path, ref);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }

  async createBlob(contentBase64: string): Promise<string> {
    const result = await this.api<{ sha: string }>(
      `/repos/${this.repo}/git/blobs`,
      {
        method: "POST",
        body: JSON.stringify({ content: contentBase64, encoding: "base64" }),
      },
    );
    return result.sha;
  }

  async createTree(
    baseTree: string,
    entries: NewTreeEntry[],
  ): Promise<GitTree> {
    const tree = entries.map((entry) => ({
      path: assertWritableRepoPath(entry.path),
      mode: entry.mode ?? "100644",
      type: entry.type,
      sha: entry.sha,
    }));
    return this.api<GitTree>(
      `/repos/${this.repo}/git/trees`,
      {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTree, tree }),
      },
      [200, 201],
    );
  }

  async createCommit(
    message: string,
    treeSha: string,
    parents: string[],
  ): Promise<GitCommit> {
    return this.api<GitCommit>(
      `/repos/${this.repo}/git/commits`,
      {
        method: "POST",
        body: JSON.stringify({ message, tree: treeSha, parents }),
      },
      [200, 201],
    );
  }

  async ensureBranch(branch: string, fromBranch: string): Promise<string> {
    try {
      const ref = await this.getRef(branch);
      return ref.object.sha;
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
      const mainRef = await this.getRef(fromBranch);
      await this.createRef(branch, mainRef.object.sha);
      return mainRef.object.sha;
    }
  }

  async branchFiles(
    branch: string,
    prefix: string,
  ): Promise<{
    headSha: string;
    treeSha: string;
    files: GitTreeItem[];
  } | null> {
    let ref: GitRef;
    try {
      ref = await this.getRef(branch);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
    const commit = await this.getCommit(ref.object.sha);
    const tree = await this.getTree(commit.tree.sha, true);
    const normalizedPrefix =
      normalizeRepoPath(prefix).replace(/\/+$/g, "") + "/";
    const files = tree.tree.filter(
      (item) =>
        item.type === "blob" &&
        (item.path === prefix || item.path.startsWith(normalizedPrefix)),
    );
    return { headSha: ref.object.sha, treeSha: commit.tree.sha, files };
  }

  async latestWorkflowRun(branch = config.repo.branch): Promise<{
    status: string;
    conclusion: string | null;
    url: string;
    name: string;
    createdAt: string;
  }> {
    const result = await this.api<{
      workflow_runs: Array<{
        status: string;
        conclusion: string | null;
        html_url: string;
        name: string;
        created_at: string;
      }>;
    }>(
      `/repos/${this.repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
    );
    const run = result.workflow_runs[0];
    if (!run) {
      return {
        status: "unknown",
        conclusion: null,
        url: `https://github.com/${this.repo}/actions`,
        name: "Deploy",
        createdAt: "",
      };
    }
    return {
      status: run.conclusion ?? run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      name: run.name,
      createdAt: run.created_at,
    };
  }

  commitUrl(sha: string): string {
    return `https://github.com/${this.repo}/commit/${sha}`;
  }
}

export function base64ToUtf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
