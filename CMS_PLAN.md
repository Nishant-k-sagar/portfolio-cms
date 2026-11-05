# Custom CMS: Requirements and Implementation Plan

Version: 2 (updated with the owner's decisions).
Working name: `portfolio-cms`.
Primary target: the portfolio site `nishant-k-sagar.github.io` (Astro, static, GitHub Pages).
Design stance: centred on the portfolio first, but content types and fields are described in one config file so adapting it to another project later is easy. No plugin system and no multi-repo support in the first release.

This is a planning document. It is not part of the portfolio build. When the CMS project is created, move it to the root of the new `portfolio-cms` repository.

---

## 0. Decisions log

| # | Question | Decision |
|---|---|---|
| 1 | Where does the CMS live? | A separate, lightweight repository (`portfolio-cms`), deployed to Cloudflare Pages. |
| 2 | How does publishing work? | Posts are first saved as drafts. Drafts are not committed to `main`. Clicking Publish commits the post to `main`. All drafts are visible in the admin at any time. |
| 3 | Domain | `*.pages.dev` for now. |
| 4 | Editor on phone and desktop | Plain markdown text area with a small toolbar and a preview tab. Clean, simple UI. |
| 5 | Make the home page intro and Skills editable | Explained below in section 16. Not part of v1. Decide later. |
| 6 | Convert images to WebP? | Yes, for PNG and JPG, because it makes files smaller (details in section 3.4). SVG and GIF keep their original format. |
| 7 | Delete | Not implemented. No delete in the UI or API for now. |
| 8 | Generic or portfolio-specific? | Portfolio first. Fields and collections live in one config file so the design stays flexible, but nothing is built only for hypothetical other projects. |
| 9 | GitHub sign-in cost | Free. GitHub OAuth apps cost nothing. |

---

## 1. Purpose and scope

### 1.1 Problem
New blog posts and project write-ups can only be published by writing a markdown file and pushing it to Git. The owner wants to write, save drafts and publish from any device through a web admin panel, without giving up the static, Git-driven publishing model.

### 1.2 Goals
1. Write, save as draft, and publish portfolio content from any browser, including a phone.
2. See every draft in one place at any time.
3. Keep Git as the single source of truth. Publishing is a commit to `main`, which can be reviewed and rolled back.
4. Keep the portfolio site fully static. No runtime server, database or API on the portfolio side.
5. Secure by default: only the owner can sign in or publish, and no GitHub token is ever exposed to the browser.
6. Stay lightweight: free tier services only, a small bundle, a simple and clean interface.

### 1.3 Non-goals (first release)
- Deleting entries (blog, project, page or timeline) from the admin.
- Multiple users or roles, comments, scheduling, translations, analytics.
- Editing site layout, styles, the colour palette picker or navigation.
- A visual (WYSIWYG) page builder, or a side-by-side live editor.
- Hosting the portfolio itself. It stays on GitHub Pages.
- Pull-request based review. (Can be added later without redesign.)

### 1.4 Constraints inherited from the portfolio (`AGENTS.md`)
| Rule | How the CMS respects it |
|---|---|
| No backend, server routes or database in the portfolio | The CMS is a separate project. The portfolio repo only receives content commits. |
| Do not change portfolio dependencies | The CMS has its own `package.json`. The portfolio `package.json` is never touched. |
| One markdown file = one piece of content, frontmatter must match the schema | The CMS writes only valid files, validated against the same rules as `content.config.ts` at publish time. |
| Images live in `/public/images/`, compressed, WebP preferred | Uploads go to `public/images/` and PNG/JPG are converted to WebP in the browser. |
| Git push is the only publishing mechanism | Publish is a commit to `main`. The existing GitHub Actions deploy does the rest. |
| No emojis in code or content | The CMS UI and templates contain no emojis. |

Additional preference: commit messages written by the CMS contain no attribution trailers.

---

## 2. Users and use cases

Single user: the site owner. One allow-listed GitHub account (`Nishant-k-sagar`). Adding more accounts later is a configuration change.

### 2.1 User stories
| ID | Story | Priority |
|---|---|---|
| US-01 | Sign in with GitHub on any device, with no passwords or pasted tokens. | Must |
| US-02 | See a list of blog posts, projects, pages and timeline entries with title, date and state (draft, published, published with unpublished changes). | Must |
| US-03 | See all drafts across every content type in one view. | Must |
| US-04 | Create a post with a form (title, date, tags, excerpt, flags) and a markdown body, and save it as a draft. | Must |
| US-05 | Reopen a draft from any device and keep editing it. | Must |
| US-06 | Click Publish to commit the entry to `main`. | Must |
| US-07 | Edit an already published entry. My edits are saved as a draft, and the live version changes only when I publish. | Must |
| US-08 | Preview the markdown before saving or publishing. | Must |
| US-09 | Get clear errors before publishing if something is invalid (missing excerpt, bad date, duplicate slug). | Must |
| US-10 | Upload an image and insert it into the post. | Should |
| US-11 | Be warned if the published file changed on GitHub since my draft was started. | Should |
| US-12 | See whether the deploy after my publish succeeded or failed. | Should |

---

## 3. Functional requirements

### 3.1 Authentication and session
- FR-A1: Sign in only through GitHub OAuth (authorization code flow with a `state` parameter).
- FR-A2: After sign-in, the server checks the GitHub login against an allow-list. Any other account is rejected with a generic message.
- FR-A3: Session is a signed cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, path `/`), with a fixed lifetime (default 7 days).
- FR-A4: Logout clears the cookie. Changing the session secret signs out every device.
- FR-A5: All `/api/*` routes except the OAuth endpoints require a valid session.

### 3.2 Content states and drafts
Draft storage decision: drafts live on a dedicated Git branch named `cms-drafts` in the portfolio repository.

Why this branch approach:
- The deploy workflow runs only on pushes to `main`, so saving a draft never rebuilds or changes the live site.
- Drafts stay in Git: versioned, readable from any device, no extra database or service, and they survive if the CMS is redeployed.
- Images attached to a draft are stored on the same branch, so publishing moves post and images together.

Alternative considered: Cloudflare KV for drafts. Simpler per save, but drafts would live outside Git and need a second storage system. Rejected for v1.

States of an entry:
| State | Meaning |
|---|---|
| Draft | Exists only on `cms-drafts`. Not on the site. |
| Published | Exists on `main` and has no pending edits. |
| Published with changes | Exists on `main` and a newer draft copy exists on `cms-drafts`. The live site shows the `main` version until publish. |

Requirements:
- FR-D1: Save draft writes the entry (and any new images) to `cms-drafts` as one commit, with message `draft: save <collection> "<title>"`.
- FR-D2: Draft validation is lenient (title and a valid slug required). Everything else may be incomplete.
- FR-D3: A drafts view lists all drafts across all collections with title, type, last saved time and state. It is also reachable as a filter on each collection list.
- FR-D4: Each draft stores the `main` file SHA it was based on (empty for new entries) in a small metadata file on `cms-drafts` (`.cms/<collection>/<slug>.json`). This is used for conflict detection at publish time.
- FR-D5: If the `cms-drafts` branch does not exist, the server creates it from the current `main` on first save.
- FR-D6: Slug uniqueness is checked against `main` and all drafts, across all collections.

### 3.3 Publishing
- FR-P1: Publish validates the draft strictly against the portfolio schema (required fields, `YYYY-MM-DD` dates, status values, length limits). Errors are listed per field and nothing is committed on failure.
- FR-P2: Publish checks the conflict rule: if the file on `main` changed since the draft's base SHA, publish stops and shows a conflict message with the choice to reload the live version or overwrite.
- FR-P3: Publish creates one atomic commit on `main` containing the entry and its images (created from the draft's existing Git objects, no re-upload), with message `content: publish <collection> "<title>"` (or `update` for an existing entry).
- FR-P4: After a successful publish, the draft files are removed from `cms-drafts`, and the entry shows as Published.
- FR-P5: Publish sets `status: "published"` unless the owner chose `archived` in the form. New entries cannot be saved to `main` with status `draft`.
- FR-P6: After publishing, the UI shows the latest GitHub Actions run for the repository (queued, running, success, failed) with a link.
- FR-P7: Publishing is always an explicit button click with a confirmation. Saving a draft never publishes.

### 3.4 Editor
- FR-E1: Metadata form generated from the config, above a markdown text area.
- FR-E2: Small toolbar: heading, bold, italic, link, inline code, code block, list, quote, image. Works on a phone.
- FR-E3: Edit and Preview tabs. Preview renders sanitised HTML and approximates the site's prose styling.
- FR-E4: Autosave of the unsaved buffer to browser local storage (text only, no secrets) so a closed tab does not lose work. This is not the same as saving a draft.
- FR-E5: Word count and estimated reading time (200 words per minute, same as the site).
- FR-E6: Unsaved changes warning when leaving the page.

### 3.5 Media
- FR-M1: Accepted types: png, jpg, webp, gif, svg. Maximum upload 5 MB.
- FR-M2: PNG and JPG are resized to a maximum width of 1600 px and re-encoded to WebP in the browser, only if the result is smaller than the original. Otherwise the original is kept. WebP, GIF and SVG are never converted.
- FR-M3: Why WebP: for photos and screenshots, WebP files are usually noticeably smaller than JPG or PNG at similar visual quality, which helps page speed and the Lighthouse targets in `AGENTS.md`. GIF is not converted because animation would be lost. SVG is not converted because it is already a vector format.
- FR-M4: Images are stored at `public/images/<collection>/<slug>/<name>.<ext>`. Names are sanitised and made unique.
- FR-M5: Inserting an image adds `![alt](/images/...)`. Alt text is required.
- FR-M6: Uploaded images go to `cms-drafts` with the draft and move to `main` on publish.

### 3.6 Content management (no delete)
- FR-C1: Collections: `blog`, `projects`, `pages`, `timeline`.
- FR-C2: List view per collection with sort (date descending), search by title, filter by state.
- FR-C3: Filename and slug come from the title (lowercase, hyphens, ASCII). Slug rules match the portfolio.
- FR-C4: Frontmatter is written with a fixed key order, quoted strings and `YYYY-MM-DD` dates so Git diffs stay small.
- FR-C5: Existing files must round-trip. Opening and saving an unchanged file produces no diff.
- FR-C6: Unknown frontmatter fields found in an existing file are preserved on save and shown as a warning (for example the stray `pinned` field in `hello.md`).
- FR-C7: The special file `pages/now.md` can be edited but its slug cannot be changed.
- FR-C8: There is no delete button and no delete API. Unwanted entries can be hidden by publishing with status `archived`, or removed manually in Git.

### 3.7 Flexibility without over-building
- FR-R1: One `cms.config.ts` defines the repository, the allow-list, the media rules and the collections with their fields.
- FR-R2: The form and server validation both read from that config, so adding a field is a one-line change.
- FR-R3: Nothing else is abstracted. There is no plugin system, no multi-repo switching and no theming layer in v1.

---

## 4. Non-functional requirements

### 4.1 Security
| ID | Requirement |
|---|---|
| NFR-S1 | The GitHub write credential never reaches the browser. It exists only as a Cloudflare secret. |
| NFR-S2 | The write credential is a fine-grained token limited to the portfolio repository with `Contents: read and write`. It has an expiry and is rotated on a schedule. |
| NFR-S3 | OAuth client secret, session signing key and write token are Cloudflare secrets, never committed or logged. |
| NFR-S4 | Mutating requests require CSRF defence: `SameSite=Strict` cookie, an `Origin` check, and a custom header required on `fetch` calls. |
| NFR-S5 | The server writes only to `src/content/<collection>/`, `public/images/` and `.cms/` on `cms-drafts`, and `src/content/...` plus `public/images/...` on `main`. Paths are normalised and `..`, absolute paths and unexpected extensions are rejected. |
| NFR-S6 | Server-side validation runs on every save and publish. Client validation is only a convenience. |
| NFR-S7 | Preview HTML is sanitised (DOMPurify). The admin app sets a strict Content-Security-Policy. |
| NFR-S8 | Rate limiting on auth and write endpoints. |
| NFR-S9 | Request limits: JSON body 1 MB, image 5 MB. |
| NFR-S10 | Error messages never include secrets, tokens or raw GitHub error bodies. |
| NFR-S11 | The admin app is served with `noindex` headers. |
| NFR-S12 | The `cms-drafts` branch must not be protected against the token, and must not trigger any workflow. A test confirms that the deploy workflow ignores it. |

### 4.2 Reliability
- NFR-R1: Optimistic concurrency using SHAs for both draft saves and publishes.
- NFR-R2: GitHub API failures return a retryable error. Publish is atomic: either `main` gets the full commit or nothing changes.
- NFR-R3: The CMS stores no content of its own. If it is down, Git and the live site are unaffected, and the manual markdown workflow still works.

### 4.3 Performance and usability
- NFR-U1: Admin first load under 150 KB gzipped JavaScript (no heavy editor library).
- NFR-U2: Usable at 375 px width. Touch targets at least 36 px.
- NFR-U3: Keyboard accessible, visible focus, labelled controls, WCAG AA contrast.
- NFR-U4: Works in current Chrome, Edge, Firefox and Safari.
- NFR-U5: Clean, quiet visual style, light and dark via system preference. No decorative components.

### 4.4 Operability and cost
- NFR-O1: One command runs the whole stack locally (`wrangler pages dev`).
- NFR-O2: Structured logs for auth failures, draft saves and publishes (no content bodies, no secrets).
- NFR-O3: Free tier only: Cloudflare Pages and Functions, GitHub free, GitHub OAuth app free.

---

## 5. Architecture

```
Browser (any device)
   |  HTTPS
   v
Cloudflare Pages: admin single-page app (static assets)
   |  fetch /api/*  (session cookie)
   v
Cloudflare Pages Functions (Workers runtime)
   |-- /api/auth/*        GitHub OAuth, session cookie
   |-- /api/content/*     list and read (main plus drafts merged)
   |-- /api/drafts/*      save draft
   |-- /api/publish/*     draft -> commit on main
   |-- /api/media         image upload (to cms-drafts)
   |-- /api/deploy/status latest workflow run
   v
GitHub API (repo: Nishant-k-sagar/nishant-k-sagar.github.io)
   |-- branch cms-drafts  (drafts and draft images, never deployed)
   |-- branch main        (published content, triggers the deploy)
   v
GitHub Actions (existing deploy) -> GitHub Pages (live site)
```

### 5.1 Why a separate Cloudflare project
- The portfolio stays static and keeps its `AGENTS.md` guarantees.
- Secrets and server code never share a repository or deploy with the public site.
- The admin can change or break without touching the live site.

### 5.2 Authentication flow
1. Browser opens the admin. The app calls `GET /api/auth/session`. If not signed in, it shows "Sign in with GitHub".
2. `GET /api/auth/login`: server creates a random `state`, stores it in a short-lived `HttpOnly` cookie, redirects to GitHub's authorize URL with the minimal scope (`read:user`).
3. GitHub redirects to `GET /api/auth/callback?code&state`. Server verifies `state`, exchanges `code` for a user token (server to server, with the client secret), calls `GET /user`, then discards the user token.
4. If the `login` is in the allow-list, the server sets the session cookie (HMAC-SHA-256 signed with Web Crypto; payload: login, issued-at, expiry). Otherwise it returns 403.
5. All GitHub writes use the server-held fine-grained token, not the user's OAuth token.

Possible later upgrade: replace the fine-grained token with a GitHub App installation token (short-lived, auto-rotating). The GitHub client sits behind one small interface so this swap changes nothing else.

### 5.3 Save draft flow
1. App sends fields, body and optional images (JSON) to `PUT /api/drafts/:collection/:slug`.
2. Server checks session, `Origin`, CSRF header and size limits.
3. Server applies lenient draft validation, builds the markdown file.
4. Server ensures `cms-drafts` exists, then creates one commit on it containing the entry, new images and the metadata file (with the base SHA from `main`).
5. Server returns the new draft state and time saved. `main` and the live site are untouched.

### 5.4 Publish flow
1. App calls `POST /api/publish/:collection/:slug`.
2. Server reads the draft file, images and metadata from `cms-drafts`.
3. Server runs strict validation and the slug uniqueness check.
4. Server compares the current `main` file SHA with the draft's base SHA. A mismatch returns `conflict` and nothing is written.
5. Server builds a new tree on top of `main` that reuses the draft's blob SHAs, creates one commit, and fast-forwards `main`.
6. Server removes the draft files and metadata from `cms-drafts` in a second commit.
7. Server returns the commit URL. The app then polls `GET /api/deploy/status` and shows the result.

If step 6 fails after step 5 succeeded, the publish still counts as successful. The leftover draft is detected by the list view (identical to `main`) and cleaned up on the next save or by a manual "clean up" action.

### 5.5 Technology choices
| Concern | Choice | Reason |
|---|---|---|
| Hosting | Cloudflare Pages + Pages Functions | Free tier, UI and API in one project |
| UI | Vite + Preact + TypeScript | Small bundle |
| Routing | A tiny client router | Only about five screens |
| Validation | `zod`, built from `cms.config.ts` | One source of truth for form and server |
| Editor | Plain `textarea` plus a small toolbar | Light, reliable on phones, meets the 150 KB budget |
| Preview | `marked` + `DOMPurify` | Small and well known |
| Frontmatter | `yaml` package with a fixed key-order serializer | Deterministic output |
| Images | Browser Canvas to WebP | No server work |
| Session crypto | Web Crypto HMAC | Built into the Workers runtime |
| Tests | Vitest (unit), `wrangler`/Miniflare (Functions), Playwright (end to end) | Standard |
| Quality gates | ESLint, Prettier, `tsc --noEmit` | Consistent code |

These are proposals. The requirements above matter more than the specific libraries.

---

## 6. Data model: portfolio collections

Mirrors `src/content.config.ts`. The CMS must keep this in sync (section 11).

### 6.1 Blog (`src/content/blog/<slug>.md`)
| Field | Type | Rules |
|---|---|---|
| title | string | required |
| slug | string | optional override, slug rules apply |
| date | date | required, `YYYY-MM-DD`, must be a real date |
| updated | date | optional, `YYYY-MM-DD` |
| tags | list of string | at least one |
| status | select | `published` or `archived` when on `main`. Drafts are not on `main`. |
| excerpt | string | required, max 300 characters |
| series, series_order | string, number | optional |
| featured, highlighted | boolean | optional |
| canonical_url | url | optional |
| seo_title | string | optional, max 60 |
| seo_description | string | optional, max 160 |
| wrap_code | boolean | optional |
| body | markdown | the content |

### 6.2 Projects (`src/content/projects/<slug>.md`)
`title`, `slug`, `date`, `tags` (list), `excerpt`, `status`, `github` (url), `live` (url), `featured` (default false), `highlighted`, `body`.

### 6.3 Pages (`src/content/pages/<slug>.md`)
`title`, `excerpt`, `status`, `seo_title`, `seo_description`, `body`. The file `now.md` is special on the site.

### 6.4 Timeline (`src/content/timeline/<slug>.md`)
`date`, `title`, `type` (blog, project, milestone, achievement, work, note), `description`, `url`, `status` (default `published`), `hide`, `pinned`, `highlighted`, `body`.
A timeline file whose id starts with `blog-` or `project-` overrides the matching entry. The UI explains this when those prefixes are used.

### 6.5 Cross-collection rules
- Slugs unique across blog, projects, pages and timeline (and across drafts).
- Dates always `YYYY-MM-DD`.
- Status written to `main` is `published` or `archived`.

---

## 7. Configuration (`cms.config.ts`)

```ts
export default {
  repo: { owner: 'Nishant-k-sagar', name: 'nishant-k-sagar.github.io', branch: 'main', draftsBranch: 'cms-drafts' },
  allowList: ['Nishant-k-sagar'],
  media: { folder: 'public/images', publicPath: '/images', maxWidth: 1600, convertToWebp: ['png', 'jpg'] },
  collections: [
    {
      name: 'blog',
      label: 'Blog posts',
      folder: 'src/content/blog',
      filename: '{{slug}}.md',
      sort: { field: 'date', order: 'desc' },
      listFields: ['title', 'date', 'state'],
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'date', type: 'date', required: true, default: 'today' },
        { name: 'tags', type: 'list', required: true, min: 1 },
        { name: 'excerpt', type: 'text', required: true, max: 300 },
        { name: 'status', type: 'select', options: ['published', 'archived'], default: 'published' },
        // remaining fields from section 6.1
      ],
    },
    // projects, pages, timeline
  ],
}
```

Field types for v1: `string`, `text`, `date`, `boolean`, `number`, `select`, `list`, `url`, `markdown`. Required-ness applies at publish time only. Drafts only require a title.

---

## 8. API specification (v1)

All responses are JSON. Errors use `{ error: { code, message, fields? } }`. Every route except auth requires a session. There is no delete route.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/auth/login` | Start OAuth | Sets `state` cookie, redirects |
| `GET /api/auth/callback` | Finish OAuth | Sets session, redirects to the app |
| `POST /api/auth/logout` | End session | Clears cookie |
| `GET /api/auth/session` | Current user | `{ login }` or 401 |
| `GET /api/config` | Collections and fields for the UI | No secrets |
| `GET /api/content/:collection` | List entries (main and drafts merged) | Returns `state` per entry, no bodies |
| `GET /api/content/:collection/:slug?source=draft or main` | Read one entry | Returns fields, body, `sha` |
| `GET /api/drafts` | All drafts across collections | Title, type, saved time |
| `PUT /api/drafts/:collection/:slug` | Create or update a draft | Lenient validation, writes to `cms-drafts` |
| `POST /api/publish/:collection/:slug` | Publish a draft | Strict validation, conflict check, commit to `main` |
| `POST /api/media` | Upload an image | Stored on `cms-drafts`, returns public path |
| `GET /api/deploy/status` | Latest workflow run | `queued, running, success, failed` plus URL |

Error codes: `unauthorized`, `forbidden`, `validation_failed` (per-field details), `conflict`, `not_found`, `rate_limited`, `upstream_error`, `payload_too_large`.

---

## 9. UI requirements

### 9.1 Screens
1. Sign in.
2. Dashboard: counts per state, the latest drafts, latest deploy status.
3. Drafts: every draft in one list, with type, title, last saved.
4. Collection list: search, state filter, "New" button. Table on desktop, stacked cards on phone.
5. Editor: collapsible metadata form, then Edit and Preview tabs. Sticky bar with Save draft, Publish, state badge, and the autosave status.
6. Media picker (modal): upload, recent uploads, insert with alt text.
7. Settings (read only): repository, signed-in account, sign out.

### 9.2 UX rules
- Save draft is the primary action. Publish is a separate, confirmed action.
- Clear states: saving, saved, conflict, publishing, deploying, deployed.
- Inline field errors that match server validation messages.
- Plain, quiet interface. No decorative elements.

---

## 10. Repository layout (CMS project)

```
portfolio-cms/
  src/                     # SPA
    app/                   # router, layout, auth gate
    screens/               # SignIn, Dashboard, Drafts, List, Editor
    components/            # fields, toolbar, preview, media picker
    lib/                   # api client, frontmatter, slug, image tools
  functions/               # Cloudflare Pages Functions
    api/
      auth/                # login, callback, logout, session
      content/             # list and read
      drafts/              # save draft
      publish/             # publish
      media.ts
      deploy/status.ts
      config.ts
    _lib/                  # session, csrf, github client, validation, rate limit
  shared/                  # types and zod builders used by both sides
  cms.config.ts            # the only project-specific file
  tests/                   # unit and end to end
  wrangler.toml
  package.json
  README.md                # setup guide
  CMS_PLAN.md              # this file
```

---

## 11. Keeping the CMS and the portfolio schema in sync
Risk: `cms.config.ts` and the portfolio's `content.config.ts` drift, and the CMS writes a file the site rejects.

Mitigations:
1. A contract test in the CMS repo compares field names, enums and required flags in `cms.config.ts` with the portfolio's `src/content.config.ts`, and fails on any difference.
2. The portfolio build already fails on invalid content. A bad publish fails the deploy and the previous site stays live.
3. Later improvement: the portfolio generates a `content-schema.json` at build time that the CMS reads.

---

## 12. Environment and secrets

| Name | Where | Purpose |
|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Pages variable | OAuth app id |
| `GITHUB_OAUTH_CLIENT_SECRET` | Pages secret | OAuth code exchange |
| `GITHUB_WRITE_TOKEN` | Pages secret | Fine-grained token, one repo, contents write |
| `SESSION_SECRET` | Pages secret | HMAC key for session cookies (32+ random bytes) |
| `ALLOWED_LOGINS` | Pages variable | Comma-separated GitHub logins |

Secrets are never committed, logged, or returned by any endpoint. Local development uses `.dev.vars` (git-ignored). KV is not required in v1.

### 12.1 One-time setup (owner steps)
1. Create a Cloudflare account and a Pages project connected to the CMS repo. The default address will be `https://<project>.pages.dev`.
2. Create a GitHub OAuth app (free). Callback URL: `https://<project>.pages.dev/api/auth/callback`. For local testing, a second OAuth app with `http://localhost:8788/api/auth/callback`.
3. Create a fine-grained token: owner `Nishant-k-sagar`, only the portfolio repository, permission `Contents: Read and write`, expiry 90 days.
4. Enter the secrets and variables in the Cloudflare dashboard (or `wrangler pages secret put`). Secret values are entered only in Cloudflare, never in chat or in files.
5. Deploy, sign in, save a test draft, confirm that `main` and the live site did not change. Publish it, and confirm the commit and deploy.

---

## 13. Implementation phases and acceptance criteria

| Phase | Scope | Done when | Estimate |
|---|---|---|---|
| 0. Setup | Repo, tooling, CI, wrangler dev, empty SPA and Functions | `npm run dev` serves the SPA and a health endpoint, lint and typecheck pass | 1 day |
| 1. Auth | OAuth login, allow-list, session cookie, logout, route guard | Owner can sign in and out. A different GitHub account is rejected. Cookie flags verified. | 2 to 3 days |
| 2. GitHub client | Read files and trees, create commits on a branch, create the drafts branch, conflict detection, path guard | Integration tests against a scratch repo pass. Path traversal tests pass. | 2 days |
| 3. Drafts and content API | Config loader, zod builders, list (merged states), read, save draft, frontmatter round-trip | Existing portfolio files round-trip with zero diff. A saved draft appears on `cms-drafts` and not on `main`. | 3 days |
| 4. Editor UI | Forms from config, textarea with toolbar, preview tab, autosave buffer, drafts view | Create, save and reopen a draft on phone and desktop | 3 days |
| 5. Publish | Strict validation, conflict check, atomic commit to `main`, draft cleanup, deploy status panel | Publishing a draft updates the live site through the existing deploy, and the panel shows the result | 2 days |
| 6. Media | Upload, WebP conversion when smaller, alt text, images travel with the draft | An uploaded image appears in a published post on the live site | 2 days |
| 7. Hardening | CSRF, CSP, rate limits, size limits, logging, error pages, accessibility pass | Security checklist (section 14.2) all green, Lighthouse accessibility 95 or above | 2 to 3 days |
| 8. Docs | README, setup guide, config reference | A fresh clone can be deployed by following the README | 1 day |

Total: about 3 weeks full time. A usable first version (phases 0 to 5, text posts with drafts and publish) is reachable in about 1.5 to 2 weeks.

Optional later (not in the plan above): editable home page intro and Skills (section 16), pull-request publish mode, discard draft, delete, a rich code editor.

---

## 14. Testing and security checklist

### 14.1 Automated tests
- Unit: slug generation, frontmatter serialization (key order, quoting, dates), zod builders per field type, path guard, session sign and verify, reading time.
- Contract: CMS config versus portfolio schema (section 11).
- Integration (Functions with Miniflare and a mocked GitHub API): auth callback, allow-list rejection, save draft writes only to `cms-drafts`, publish writes to `main` atomically, conflict handling, rate limiting.
- End to end (Playwright): sign in (mocked), create draft, reopen on a phone viewport, publish, upload image.
- Round-trip: every file in the portfolio `src/content/` loads and saves with no diff.
- Workflow test: the deploy workflow does not run for pushes to `cms-drafts`.

### 14.2 Security checklist (must be green before first real use)
- [ ] No secret in the repository history or build output.
- [ ] Session cookie is `HttpOnly`, `Secure`, `SameSite=Strict`.
- [ ] Every `/api/*` route except auth returns 401 without a session.
- [ ] A non-allow-listed GitHub account cannot sign in.
- [ ] Mutating routes reject a wrong `Origin` and a missing custom header.
- [ ] Path traversal (`../`, encoded variants, absolute paths) is rejected.
- [ ] Only allowed extensions and MIME types are accepted for media.
- [ ] Oversized body and image are rejected with 413.
- [ ] Preview HTML is sanitised and the CSP blocks inline script.
- [ ] The write token is scoped to one repository and has an expiry.
- [ ] Rate limits are active on login and write routes.
- [ ] Error responses leak no internal detail.
- [ ] Saving a draft never changes `main` or triggers a deploy.

---

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Write token leaked | Attacker can commit to the repo | Single-repo scope, expiry, secret storage only, rotation reminder, optional move to a GitHub App |
| `cms-drafts` branch gets deleted or force-pushed by hand | Drafts lost | Document the branch, keep it unprotected but not otherwise touched, drafts are small text files and recoverable from Git history (reflog on the remote is limited, so keep a copy of important drafts) |
| Draft publish overwrites newer manual edit | Lost changes | Base SHA check and conflict screen |
| CMS writes a file the site rejects | Failed deploy | Strict validation, contract test, previous site stays live on a failed build |
| Frontmatter reformatting noise | Large Git diffs | Deterministic serializer, round-trip test |
| Drafts pile up with no delete | Cluttered list | Drafts view with search and sort, plus an optional discard action later |
| Scope creep | Long timeline | Stay within sections 1.2 and 1.3, add features through a new plan entry |

---

## 16. Explanation: editable home page intro and Skills (decision 5)

Today, the home page intro text ("I am an aspiring software engineer...") and the Skills lists (Frontend: React, TypeScript...) are written directly inside the page file `src/pages/index.astro`. The CMS only edits markdown files under `src/content/`, so it cannot reach text that lives inside page code. To change that text now, you must edit `index.astro` and push.

The option: move that text into content files (for example `src/content/pages/home.md` for the intro and a small data file for the Skills groups), and make `index.astro` read from them. After that, the CMS could edit the home page text like any other page. This also matches your `AGENTS.md` rule of never hardcoding content in pages or components.

Cost and impact: a small change in the portfolio (about half a day), no visual change, plus one more collection in the CMS config.

Decision: not part of v1. It can be added later as a small separate task.

---

## 17. Definition of done (first release)
- Owner signs in with GitHub on a laptop and a phone, and only that account can.
- Owner creates a blog post, saves it as a draft, reopens it on another device, edits it, and sees it in the drafts view.
- Clicking Publish commits the post to `main`, and the live site updates through the existing deploy. Saving a draft never changes `main`.
- Owner edits a published post as a draft and the live version changes only on publish.
- An image uploaded in the editor appears on the live site, converted to WebP when that makes it smaller.
- All existing portfolio content round-trips without diffs.
- Security checklist is green and tests pass in CI.
- README documents setup, secrets, rotation and operation.
- No change to the portfolio repository other than content commits, and no change to its dependencies.