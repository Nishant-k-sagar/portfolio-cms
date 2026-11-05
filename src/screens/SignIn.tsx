export function SignIn() {
  return (
    <main className="main">
      <section className="hero" aria-labelledby="signin-title">
        <p className="kicker">Portfolio CMS</p>
        <h1 id="signin-title">Sign in to publish</h1>
        <p className="muted" style={{ maxWidth: "60ch" }}>
          Write posts, projects, pages and timeline entries from any device.
          Drafts stay on the private <code>cms-drafts</code> branch until you
          explicitly publish to <code>main</code>.
        </p>
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <a className="button primary" href="/api/auth/login">
            Sign in with GitHub
          </a>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Only the allow-listed GitHub account can sign in. No password is
          stored by the CMS.
        </p>
      </section>
    </main>
  );
}
