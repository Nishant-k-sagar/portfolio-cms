# Portfolio CMS

A small, Git-backed CMS for the `Nishant-k-sagar/nishant-k-sagar.github.io` portfolio site. The portfolio remains fully static. Publishing is a commit to `main`; drafts live on the `cms-drafts` branch and never trigger the deploy workflow.

## What is included

- GitHub OAuth sign-in with an allow-list. Only configured GitHub logins can use the admin.
- Drafts saved to a dedicated `cms-drafts` branch with optimistic concurrency and base-SHA metadata for publish conflict detection.
- Explicit publish flow: validate strictly, detect conflicts against `main`, commit atomically, clean up the draft, then show the latest GitHub Actions deploy run.
- Config-driven collections and fields (`cms.config.ts`): `blog`, `projects`, `pages`, `timeline`, `skills`, `socials`, `home`, `experience`.
- Editor with markdown toolbar, preview tab, autosave to local storage, word count, reading time and unsaved-changes warning.
- Browser-side image preparation for PNG/JPG (resize to 1600 px and re-encode to WebP when smaller). SVG, GIF and WebP keep their format.
- Delete: drafts can be discarded and published entries removed from the live site, each with a confirmation. Entries can also be hidden by publishing with `status: "archived"`.

## Repository layout

```text
src/                  Admin single-page app (Preact + Vite)
functions/            Cloudflare Pages Functions API
shared/               Types, frontmatter, validation and slug helpers
cms.config.ts         The single project-specific config file
tests/                Unit, contract, round-trip and mocked integration tests
public/_headers       noindex and Content-Security-Policy headers for Pages
CMS_PLAN.md           Original implementation plan and decisions log
```

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local secrets:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Fill in a local GitHub OAuth app, a fine-grained token limited to the portfolio repository with `Contents: Read and write`, a 32+ byte `SESSION_SECRET`, and `ALLOWED_LOGINS`.

3. Run checks and the app:

   ```bash
   npm run typecheck
   npm test
   npm run dev
   ```

   `npm run dev` builds the SPA, then serves it and the Functions with `wrangler pages dev` on <http://localhost:8788>.

## Deploying to Cloudflare Pages

1. Create a Cloudflare Pages project connected to this CMS repository. Build command: `npm run build`. Output directory: `dist`.
2. Create a GitHub OAuth app. Callback URL: `https://<project>.pages.dev/api/auth/callback`. For local testing, create a second OAuth app with `http://localhost:8788/api/auth/callback`.
3. Create a fine-grained GitHub token: owner `Nishant-k-sagar`, only the portfolio repository, permission `Contents: Read and write`, expiry 90 days.
4. Set variables and secrets in Cloudflare Pages:

   | Name                         | Type     | Purpose                                                      |
   | ---------------------------- | -------- | ------------------------------------------------------------ |
   | `GITHUB_OAUTH_CLIENT_ID`     | variable | OAuth app id                                                 |
   | `GITHUB_OAUTH_CLIENT_SECRET` | secret   | OAuth code exchange                                          |
   | `GITHUB_WRITE_TOKEN`         | secret   | Fine-grained token, one repo, contents write                 |
   | `SESSION_SECRET`             | secret   | HMAC key for session cookies, 32+ random bytes               |
   | `ALLOWED_LOGINS`             | variable | Comma-separated GitHub logins, for example `Nishant-k-sagar` |

5. Deploy, sign in, save a test draft, confirm `main` and the live site did not change, then publish it and confirm the commit and deploy.

## Secrets and rotation

- Never commit `.dev.vars` or real secret values.
- Rotate `GITHUB_WRITE_TOKEN` every 90 days and after any suspected leak. Update the Cloudflare secret and redeploy if needed.
- Rotate `SESSION_SECRET` to sign out every device.
- Error responses never include secrets or raw GitHub error bodies.

## Operating notes

- Drafts are normal files on `cms-drafts`, plus metadata in `.cms/<collection>/<slug>.json` containing the `main` SHA the draft was based on.
- Saving a draft commits only to `cms-drafts`. The deploy workflow does not run for that branch.
- Publishing validates strictly, checks the base SHA, creates one commit on `main`, then removes the draft files from `cms-drafts` in a second commit.
- If the post-publish draft cleanup fails, the publish still counts. The entry will show as published with no pending changes once the draft blob matches `main`, or can be cleaned up in Git.
- Unknown frontmatter fields are preserved and shown as a warning.
- `pages/now.md` can be edited but its slug is locked.

## Tests and quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The contract test is strict when enabled: it compares collection field names, required flags and select options between `cms.config.ts` and the portfolio schema.

On this machine the portfolio schema is at:

```text
C:\Personal\nishant-k-sagar.github.io\src\content.config.ts
```

Run it on Windows PowerShell with either an absolute path, or a relative path from `C:\Personal\cms-repo`:

```powershell
$env:PORTFOLIO_CONTENT_CONFIG='C:\Personal\nishant-k-sagar.github.io\src\content.config.ts'; npm test
# or
$env:PORTFOLIO_CONTENT_CONFIG='..\nishant-k-sagar.github.io\src\content.config.ts'; npm test
```

If you run the command from another directory, use the absolute path. The test fails with a clear error when the file does not exist.

## Security checklist

- Session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`, path `/`.
- Every `/api/*` route except OAuth login/callback requires a valid session; all non-auth API routes return 401 otherwise.
- A non-allow-listed GitHub account receives 403 after OAuth.
- Mutating routes require `SameSite=Strict` cookie, matching `Origin`, and `X-Requested-With: portfolio-cms`.
- Paths are normalised; traversal, absolute paths and unexpected extensions are rejected.
- Preview HTML is sanitised with DOMPurify; the app sets a strict Content-Security-Policy and `noindex` headers.
- JSON bodies are limited to 1 MB except draft saves with images, which are limited to 20 MB and validate each image at 5 MB; media endpoints are limited to 5 MB per image.
- Rate limits apply to OAuth, content, draft, publish and media endpoints.
- The write token is scoped to one repository and has an expiry. It is never sent to the browser.

## Known limits

- Pull request review mode is not included.
- The portfolio repository is not bundled with this project; it remains a separate repository.
- The strict schema contract test is opt-in because the portfolio checkout location varies by machine.
