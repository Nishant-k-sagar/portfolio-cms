import { useState } from "preact/hooks";
import { logout, type PublicConfig } from "../lib/api";

export function Settings({
  config,
  login,
}: {
  config: PublicConfig;
  login: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      location.hash = "#/";
      location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not sign out.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="kicker">Settings</p>
          <h1>Read-only settings</h1>
        </div>
      </div>
      <section className="panel" aria-labelledby="repo-heading">
        <h2 id="repo-heading" style={{ marginTop: 0 }}>
          Repository
        </h2>
        <dl>
          <dt>Repository</dt>
          <dd>
            <code>
              {config.repo.owner}/{config.repo.name}
            </code>
          </dd>
          <dt>Live branch</dt>
          <dd>
            <code>{config.repo.branch}</code>
          </dd>
          <dt>Drafts branch</dt>
          <dd>
            <code>cms-drafts</code>
          </dd>
          <dt>Signed in as</dt>
          <dd>{login}</dd>
        </dl>
        <p className="muted">
          The write token is stored only in Cloudflare secrets. It is never sent
          to the browser. Rotate the fine-grained token every 90 days and after
          any suspected leak.
        </p>
        <button
          type="button"
          className="danger"
          onClick={signOut}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
        {message ? (
          <p role="alert" className="warning">
            {message}
          </p>
        ) : null}
      </section>
    </>
  );
}
