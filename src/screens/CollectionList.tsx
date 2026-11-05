import { useEffect, useMemo, useState } from "preact/hooks";
import type { EntrySummary, EntryState } from "../../shared/types";
import { listContent, type PublicConfig } from "../lib/api";
import { StateBadge } from "../components/StateBadge";
import { navigate } from "../app/App";

const STATE_FILTERS: Array<{ value: "all" | EntryState; label: string }> = [
  { value: "all", label: "All states" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "published-with-changes", label: "Published with changes" },
];

export function CollectionList({
  config,
  collectionName,
}: {
  config: PublicConfig;
  collectionName: string;
}) {
  const collection = config.collections.find(
    (item) => item.name === collectionName,
  );
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | EntryState>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!collection) return;
    setError("");
    listContent(collection.name)
      .then((result) => setEntries(result.entries))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load entries.",
        ),
      );
  }, [collection]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (state !== "all" && entry.state !== state) return false;
      if (q && !entry.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, query, state]);

  if (!collection) {
    return (
      <section className="panel">
        <h1>Unknown collection</h1>
        <p className="muted">Choose a collection from the navigation.</p>
      </section>
    );
  }

  const newHref = `#/edit/${collection.name}/new`;
  return (
    <>
      <div className="page-header">
        <div>
          <p className="kicker">Collection</p>
          <h1>{collection.label}</h1>
        </div>
        <a className="button primary" href={newHref}>
          New
        </a>
      </div>
      {error ? (
        <p role="alert" className="warning">
          {error}
        </p>
      ) : null}
      <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor="search-entries" className="muted">
          Search
        </label>
        <input
          id="search-entries"
          className="input"
          style={{ maxWidth: 320 }}
          type="search"
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search titles"
        />
        <label htmlFor="state-filter" className="muted">
          State
        </label>
        <select
          id="state-filter"
          className="select"
          style={{ width: "auto" }}
          value={state}
          onChange={(event) =>
            setState(event.currentTarget.value as "all" | EntryState)
          }
        >
          {STATE_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className="table-wrap"
        role="region"
        aria-label={`${collection.label} table`}
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Date</th>
              <th>State</th>
              <th>
                <span className="muted">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.slug}>
                <td>
                  <strong>{entry.title}</strong>
                  <br />
                  <span className="muted">{entry.slug}</span>
                </td>
                <td>{entry.date ?? "—"}</td>
                <td>
                  <StateBadge state={entry.state} />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`#/edit/${collection.name}/${entry.slug}`)
                    }
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No entries match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="cards" aria-label={`${collection.label} cards`}>
        {filtered.map((entry) => (
          <article className="card" key={entry.slug}>
            <h2 style={{ marginTop: 0 }}>{entry.title}</h2>
            <p className="muted">
              {entry.date ?? "No date"} · <code>{entry.slug}</code>
            </p>
            <p>
              <StateBadge state={entry.state} />
            </p>
            <button
              type="button"
              onClick={() =>
                navigate(`#/edit/${collection.name}/${entry.slug}`)
              }
            >
              Edit
            </button>
          </article>
        ))}
        {filtered.length === 0 ? (
          <p className="muted">No entries match.</p>
        ) : null}
      </div>
    </>
  );
}
