import { useState } from "preact/hooks";
import type { EntryState } from "../../shared/types";
import { deleteEntry } from "../lib/api";
import { useModal } from "../lib/useModal";

/**
 * Delete confirmation. Which choices appear depends on where the entry exists:
 * - draft only: discard the draft.
 * - published: remove it from the live site (a commit to main, the deploy then takes it offline).
 * - published with changes: either throw away only the unpublished changes, or remove everything.
 */
export function DeleteDialog({
  collection,
  slug,
  title,
  state,
  locked,
  onClose,
  onDone,
}: {
  collection: string;
  slug: string;
  title: string;
  state: EntryState;
  locked: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = state !== "draft";
  const hasDraft = state !== "published";

  // Deleting is destructive: ignore Escape while a request is in flight.
  useModal(() => {
    if (!busy) onClose();
  });

  const run = async (scope: "draft" | "all") => {
    setBusy(true);
    setError("");
    try {
      const result = await deleteEntry(collection, slug, scope);
      onDone(
        scope === "draft"
          ? "Draft discarded."
          : result.commitUrl
            ? "Deleted. The live site updates once the deploy finishes (about a minute)."
            : "Draft deleted.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Delete"
      >
        <div className="page-header" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Delete “{title}”?</h2>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        {!live ? (
          <p>
            This draft was never published. It will be removed for good from the
            CMS.
          </p>
        ) : (
          <>
            <p>
              {hasDraft
                ? "This entry is live and also has unpublished changes."
                : "This entry is live on your site."}{" "}
              Deleting it commits the removal to <code>main</code>, so the page
              disappears after the next deploy. It can only be brought back from
              the GitHub history.
            </p>
            {locked ? (
              <p className="warning">
                This is part of a fixed page of the site, so it cannot be
                deleted from the live site. You can still discard your
                unpublished changes.
              </p>
            ) : null}
          </>
        )}
        <div className="toolbar">
          {!live ? (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => run("all")}
            >
              {busy ? "Deleting…" : "Delete draft"}
            </button>
          ) : (
            <>
              {!locked ? (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => run("all")}
                >
                  {busy ? "Deleting…" : "Delete from site"}
                </button>
              ) : null}
              {hasDraft ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("draft")}
                >
                  Only discard unpublished changes
                </button>
              ) : null}
            </>
          )}
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
