import { useEffect, useState } from "preact/hooks";
import {
  getDeployStatus,
  listContent,
  listDrafts,
  type PublicConfig,
} from "../lib/api";
import type { EntrySummary } from "../../shared/types";
import { StateBadge } from "../components/StateBadge";
import { navigate } from "../app/App";

export function Dashboard({ config }: { config: PublicConfig }) {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [drafts, setDrafts] = useState<EntrySummary[]>([]);
  const [deploy, setDeploy] = useState<Awaited<
    ReturnType<typeof getDeployStatus>
  > | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [lists, draftResult, deployResult] = await Promise.all([
        Promise.allSettled(
          config.collections.map((collection) => listContent(collection.name)),
        ),
        listDrafts().catch(() => ({ drafts: [] as EntrySummary[] })),
        getDeployStatus().catch(() => null),
      ]);
      if (cancelled) return;
      // One failing collection must not blank the whole dashboard.
      const failed: string[] = [];
      const all: EntrySummary[] = [];
      lists.forEach((result, index) => {
        if (result.status === "fulfilled") all.push(...result.value.entries);
        else failed.push(config.collections[index].label);
      });
      setEntries(all);
      setDrafts(draftResult.drafts);
      setDeploy(deployResult);
      if (failed.length > 0)
        setError(`Could not load: ${failed.join(", ")}. Counts exclude them.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.collections]);

  const published = entries.filter(
    (entry) => entry.state === "published",
  ).length;
  const withChanges = entries.filter(
    (entry) => entry.state === "published-with-changes",
  ).length;
  const draftOnly = drafts.filter((entry) => entry.state === "draft").length;
  const latestDrafts = drafts.slice(0, 5);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="kicker">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => navigate("#/list/blog")}
        >
          Write a post
        </button>
      </div>
      {error ? (
        <p role="alert" className="warning">
          {error}
        </p>
      ) : null}
      <section className="grid cols-4" aria-label="Content counts">
        <Stat label="Published" value={published} />
        <Stat label="Published with changes" value={withChanges} />
        <Stat label="Drafts" value={draftOnly} />
        <Stat label="Deploy" value={deploy?.status ?? "unknown"} />
      </section>

      <div className="grid cols-2" style={{ marginTop: "1rem" }}>
        <section className="panel" aria-labelledby="latest-drafts">
          <div className="page-header" style={{ marginBottom: "0.5rem" }}>
            <h2 id="latest-drafts" style={{ margin: 0 }}>
              Latest drafts
            </h2>
            <a href="#/drafts">View all</a>
          </div>
          {latestDrafts.length === 0 ? (
            <p className="muted">
              No drafts yet. Create one from any collection.
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {latestDrafts.map((draft) => (
                <li
                  key={`${draft.collection}/${draft.slug}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <strong>{draft.title}</strong>
                    <br />
                    <span className="muted">
                      {draft.collectionLabel} · saved{" "}
                      {formatTime(draft.updatedAt)}
                    </span>
                  </span>
                  <StateBadge state={draft.state} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="deploy-status">
          <h2 id="deploy-status" style={{ marginTop: 0 }}>
            Latest deploy after publish
          </h2>
          {deploy ? (
            <>
              <p>
                <span className="badge">{deploy.status}</span>
              </p>
              <p className="muted">
                {deploy.name}
                {deploy.createdAt
                  ? ` · ${new Date(deploy.createdAt).toLocaleString()}`
                  : ""}
              </p>
              <a
                className="button"
                href={deploy.url}
                target="_blank"
                rel="noreferrer"
              >
                Open workflow run
              </a>
            </>
          ) : (
            <p className="muted">Loading deploy status…</p>
          )}
          <p className="muted">
            Saving a draft never deploys. Publishing commits to{" "}
            <code>main</code>, and the existing GitHub Actions workflow deploys
            the site.
          </p>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <p className="muted" style={{ margin: 0 }}>
        {label}
      </p>
      <p
        style={{
          fontSize: "2rem",
          lineHeight: 1,
          margin: "0.35rem 0 0",
          fontWeight: 800,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "unknown";
}
