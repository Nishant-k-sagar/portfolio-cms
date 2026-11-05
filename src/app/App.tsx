import { useEffect, useState } from "preact/hooks";
import { getConfig, getSession, type PublicConfig } from "../lib/api";
import { SignIn } from "../screens/SignIn";
import { Dashboard } from "../screens/Dashboard";
import { Drafts } from "../screens/Drafts";
import { CollectionList } from "../screens/CollectionList";
import { Editor } from "../screens/Editor";
import { Settings } from "../screens/Settings";

export function navigate(hash: string): void {
  window.location.hash = hash;
}

type Route =
  | { name: "dashboard" }
  | { name: "drafts" }
  | { name: "list"; collection: string }
  | { name: "edit"; collection: string; slug: string }
  | { name: "settings" };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "drafts") return { name: "drafts" };
  if (parts[0] === "list" && parts[1])
    return { name: "list", collection: parts[1] };
  if (parts[0] === "edit" && parts[1] && parts[2])
    return { name: "edit", collection: parts[1], slug: parts[2] };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "dashboard" };
}

export function App() {
  const [session, setSession] = useState<{ login: string } | null | "loading">(
    "loading",
  );
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    getSession()
      .then((result) => setSession(result))
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (session === "loading" || session === null) return;
    getConfig()
      .then(setConfig)
      .catch((error) =>
        setConfigError(
          error instanceof Error
            ? error.message
            : "Could not load configuration.",
        ),
      );
  }, [session]);

  if (session === "loading") {
    return (
      <main className="main">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (session === null) {
    return <SignIn />;
  }
  if (configError) {
    return (
      <main className="main">
        <section className="panel">
          <h1>Could not load CMS</h1>
          <p role="alert" className="warning">
            {configError}
          </p>
        </section>
      </main>
    );
  }
  if (!config) {
    return (
      <main className="main">
        <p className="muted">Loading configuration…</p>
      </main>
    );
  }

  const current =
    route.name === "dashboard"
      ? "/"
      : `/${route.name}${"collection" in route ? `/${route.collection}` : ""}`;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            Portfolio CMS
          </a>
          <nav className="nav" aria-label="Main navigation">
            <a href="#/" aria-current={current === "/" ? "page" : undefined}>
              Dashboard
            </a>
            <a
              href="#/drafts"
              aria-current={route.name === "drafts" ? "page" : undefined}
            >
              Drafts
            </a>
            {config.collections.map((collection) => (
              <a
                key={collection.name}
                href={`#/list/${collection.name}`}
                aria-current={
                  (route.name === "list" || route.name === "edit") &&
                  route.collection === collection.name
                    ? "page"
                    : undefined
                }
              >
                {collection.label}
              </a>
            ))}
            <a
              href="#/settings"
              aria-current={route.name === "settings" ? "page" : undefined}
            >
              Settings
            </a>
          </nav>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {route.name === "dashboard" ? <Dashboard config={config} /> : null}
        {route.name === "drafts" ? <Drafts /> : null}
        {route.name === "list" ? (
          <CollectionList config={config} collectionName={route.collection} />
        ) : null}
        {route.name === "edit" ? (
          <Editor
            config={config}
            collectionName={route.collection}
            slugParam={route.slug}
            login={session.login}
          />
        ) : null}
        {route.name === "settings" ? (
          <Settings config={config} login={session.login} />
        ) : null}
      </main>
    </div>
  );
}
