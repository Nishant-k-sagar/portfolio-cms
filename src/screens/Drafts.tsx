import { useEffect, useState } from "preact/hooks";
import { listDrafts } from "../lib/api";
import type { EntrySummary } from "../../shared/types";
import { StateBadge } from "../components/StateBadge";
import { navigate } from "../app/App";

export function Drafts() {
  const [drafts, setDrafts] = useState<EntrySummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listDrafts()
      .then((result) => setDrafts(result.drafts))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load drafts."),
      );
  }, []);

  const filtered = drafts.filter((draft) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      draft.title.toLowerCase().includes(q) ||
      draft.collection.includes(q) ||
      draft.slug.includes(q)
    );
  });

  return (
    <>
      <div className="page-header">
        <div>
          <p className="kicker">Drafts</p>
          <h1>All drafts</h1>
        </div>
      </div>
      {error ? (
        <p role="alert" className="warning">
          {error}
        </p>
      ) : null}
      <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor="draft-search" className="muted">
          Search
        </label>
        <input
          id="draft-search"
          className="input toolbar-search"
          type="search"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search drafts"
        />
      </div>

      <div
        className="table-wrap"
        role="region"
        aria-label="Drafts table"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Last saved</th>
              <th>State</th>
              <th>
                <span className="muted">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((draft) => (
              <tr key={`${draft.collection}/${draft.slug}`}>
                <td>
                  <strong>{draft.title}</strong>
                  <br />
                  <span className="muted">{draft.slug}</span>
                </td>
                <td>{draft.collectionLabel}</td>
                <td>
                  {draft.updatedAt
                    ? new Date(draft.updatedAt).toLocaleString()
                    : "unknown"}
                </td>
                <td>
                  <StateBadge state={draft.state} />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`#/edit/${draft.collection}/${draft.slug}`)
                    }
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No drafts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="cards" aria-label="Draft cards">
        {filtered.map((draft) => (
          <article className="card" key={`${draft.collection}/${draft.slug}`}>
            <h2 style={{ marginTop: 0 }}>{draft.title}</h2>
            <p className="muted">
              {draft.collectionLabel} · saved{" "}
              {draft.updatedAt
                ? new Date(draft.updatedAt).toLocaleString()
                : "unknown"}
            </p>
            <p>
              <StateBadge state={draft.state} />
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(`#/edit/${draft.collection}/${draft.slug}`)
              }
            >
              Open draft
            </button>
          </article>
        ))}
        {filtered.length === 0 ? (
          <p className="muted">No drafts found.</p>
        ) : null}
      </div>
    </>
  );
}
