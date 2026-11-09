import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  getDeployStatus,
  getEntry,
  publishDraft,
  saveDraft,
  ApiError,
  type PublicConfig,
} from "../lib/api";
import { validateFields, todayYmd } from "../../shared/validation";
import { isValidSlug, slugify } from "../../shared/slug";
import { readingStats } from "../../shared/readingTime";
import type {
  CollectionConfig,
  FieldValue,
  EntryState,
} from "../../shared/types";
import { blobToBase64, type PreparedImage } from "../lib/images";
import { FieldInput } from "../components/FieldInput";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { MediaPicker, type PreparedUpload } from "../components/MediaPicker";
import { navigate } from "../app/App";
import { DeleteDialog } from "../components/DeleteDialog";
import { StateBadge } from "../components/StateBadge";
import { Toolbar } from "../components/Toolbar";
import { useModal } from "../lib/useModal";
import {
  applyAction,
  type Edit,
  type ToolbarAction,
} from "../lib/markdownEdit";

interface EditorProps {
  config: PublicConfig;
  collectionName: string;
  slugParam: string;
  login?: string;
}

interface PendingImage {
  image: PreparedImage;
  alt: string;
}

interface RestorePrompt {
  fields: Record<string, FieldValue>;
  body: string;
  savedAt: string;
}

function defaultsFor(collection: CollectionConfig): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const field of collection.fields) {
    if (field.default === undefined) continue;
    if (field.default === "today" && field.type === "date")
      out[field.name] = todayYmd();
    else out[field.name] = field.default;
  }
  return out;
}

function storageKey(collection: string, key: string): string {
  return `portfolio-cms:autosave:${collection}:${key}`;
}

function recentKey(): string {
  return "portfolio-cms:recent-images";
}

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(recentKey()) ?? "[]",
    ) as string[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export function Editor({ config, collectionName, slugParam }: EditorProps) {
  const foundCollection = config.collections.find(
    (item) => item.name === collectionName,
  );
  const collection = foundCollection ?? config.collections[0];
  const collectionMissing = !foundCollection;
  const isNew = slugParam === "new";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Where to put the caret once the textarea has been re-rendered with new text.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fields, setFields] = useState<Record<string, FieldValue>>(() =>
    collection ? defaultsFor(collection) : {},
  );
  const [body, setBody] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);
  // After the first save of a new entry the slug is fixed, so later title edits cannot fork a second draft.
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [source, setSource] = useState<"main" | "draft">("main");
  const [entryState, setEntryState] = useState<EntryState>("draft");
  const [expectedDraftSha, setExpectedDraftSha] = useState<string | null>(null);
  const [unknownFields, setUnknownFields] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autosaveStatus, setAutosaveStatus] = useState("Saved locally");
  const [restorePrompt, setRestorePrompt] = useState<RestorePrompt | null>(
    null,
  );
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [existingPaths, setExistingPaths] = useState<string[]>(() =>
    loadRecent(),
  );
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    commitUrl: string;
    cleanupWarning?: string;
  } | null>(null);
  const [deploy, setDeploy] = useState<Awaited<
    ReturnType<typeof getDeployStatus>
  > | null>(null);

  useEffect(() => {
    if (collectionMissing) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setNotFound(false);
    const defaults = defaultsFor(collection);
    const key = storageKey(collection.name, slugParam);

    if (isNew) {
      setFields(defaults);
      setBody("");
      setSlugLocked(false);
      setCreatedSlug(null);
      setSource("main");
      setEntryState("draft");
      setExpectedDraftSha(null);
      setUnknownFields([]);
      setLoading(false);
      maybeOfferRestore(key, defaults, "");
      return;
    }

    getEntry(collection.name, slugParam)
      .then((doc) => {
        if (cancelled) return;
        const nextFields = { ...defaults, ...doc.fields };
        setFields(nextFields);
        setBody(doc.body);
        setSlugLocked(Boolean(doc.slugLocked));
        setSource(doc.source);
        setEntryState(doc.state);
        setExpectedDraftSha(doc.source === "draft" ? (doc.sha ?? null) : null);
        setUnknownFields(doc.unknownFields);
        maybeOfferRestore(key, nextFields, doc.body);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404)
          setNotFound(true);
        else
          setLoadError(
            error instanceof Error ? error.message : "Could not load entry.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [collectionName, slugParam]);

  function maybeOfferRestore(
    key: string,
    currentFields: Record<string, FieldValue>,
    currentBody: string,
  ) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RestorePrompt;
      if (!parsed || typeof parsed.body !== "string") return;
      const differs =
        parsed.body !== currentBody ||
        JSON.stringify(parsed.fields) !== JSON.stringify(currentFields);
      if (differs) setRestorePrompt(parsed);
    } catch {
      localStorage.removeItem(key);
    }
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!collection || loading || !dirty) return;
    setAutosaveStatus("Saving locally…");
    const key = storageKey(collection.name, slugParam);
    const timeout = window.setTimeout(() => {
      localStorage.setItem(
        key,
        JSON.stringify({ fields, body, savedAt: new Date().toISOString() }),
      );
      setAutosaveStatus(
        `Saved locally ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      );
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [fields, body, dirty, loading, collection, slugParam]);

  useEffect(() => {
    if (!publishResult) return;
    let cancelled = false;
    const poll = () => {
      getDeployStatus()
        .then((status) => {
          if (!cancelled) setDeploy(status);
        })
        .catch(() => undefined);
    };
    poll();
    const interval = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [publishResult]);

  const stats = useMemo(() => readingStats(body), [body]);
  const hasStatusField = collection?.fields.some((f) => f.name === "status");
  const statusValue = String(fields.status ?? "published");
  const isHidden = Boolean(hasStatusField) && statusValue === "archived";
  const effectiveSlug = useMemo(() => {
    if (!isNew) return slugParam;
    return createdSlug ?? slugify(String(fields.title ?? ""));
  }, [isNew, slugParam, fields.title, createdSlug]);

  // Ctrl/Cmd+S saves the draft from any field. Refs keep the handler pointing at the latest state.
  const saveRef = useRef<() => void>(() => undefined);
  saveRef.current = () => {
    if (!saving && !publishing) void persistDraft();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Restore the caret after a toolbar or shortcut edit has been rendered.
  useEffect(() => {
    const selection = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!selection || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  }, [body]);

  if (collectionMissing) {
    return (
      <section className="panel">
        <h1>Unknown collection</h1>
        <p className="muted">Choose a collection from the navigation.</p>
      </section>
    );
  }

  const liveUrlFor = (slug: string): string | null => {
    if (!collection.livePath) return null;
    return `${config.siteUrl}${collection.livePath.replace("{{slug}}", slug)}`;
  };
  const locked =
    slugLocked || Boolean(collection.specialSlugLocked?.includes(slugParam));
  const publicPathFor = (fileName: string) =>
    `${config.media.publicPath}/${collection.name}/${effectiveSlug || "new"}/${fileName}`;

  function markDirty(next: () => void) {
    next();
    setDirty(true);
    setPublishResult(null);
  }

  function setField(name: string, value: FieldValue) {
    markDirty(() => {
      setFields((current) => ({ ...current, [name]: value }));
      setFieldErrors((current) => {
        if (!current[name]) return current;
        const next = { ...current };
        delete next[name];
        return next;
      });
    });
  }

  function insertAtCursor(markdown: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody(
        (current) =>
          `${current}${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${markdown}\n`,
      );
      setDirty(true);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${body.slice(0, start)}${markdown}${body.slice(end)}`;
    const cursor = start + markdown.length;
    pendingSelection.current = { start: cursor, end: cursor };
    setBody(next);
    setDirty(true);
  }

  function applyEdit(edit: Edit) {
    pendingSelection.current = { start: edit.selStart, end: edit.selEnd };
    markDirty(() => setBody(edit.text));
  }

  function runAction(action: ToolbarAction) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    applyEdit(
      applyAction(action, body, textarea.selectionStart, textarea.selectionEnd),
    );
  }

  function handleEditorKeyDown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      runAction("bold");
    } else if (key === "i") {
      event.preventDefault();
      runAction("italic");
    } else if (key === "k") {
      event.preventDefault();
      runAction("link");
    }
  }

  function handlePreparedImage(upload: PreparedUpload) {
    if (!effectiveSlug || (isNew && !isValidSlug(effectiveSlug))) {
      setNotice(
        "Add a valid title so the image path can be created before inserting images.",
      );
      return;
    }
    const path = publicPathFor(upload.image.fileName);
    setPendingImages((current) => [
      ...current,
      { image: upload.image, alt: upload.alt },
    ]);
    insertAtCursor(`![${upload.alt}](${path})`);
    setNotice("Image queued. It will be committed when you save the draft.");
  }

  function insertExisting(path: string, alt: string) {
    insertAtCursor(`![${alt}](${path})`);
    setMediaOpen(false);
  }

  async function persistDraft(
    options: { silent?: boolean } = {},
  ): Promise<{ slug: string } | null> {
    const targetSlug = isNew ? (createdSlug ?? effectiveSlug) : slugParam;
    if (!targetSlug || (isNew && !isValidSlug(targetSlug))) {
      setFieldErrors({
        slug: "Enter a valid title so a slug can be generated.",
      });
      setNotice("Fix the slug before saving.");
      return null;
    }
    const validation = validateFields(collection, fields, "draft");
    if (!validation.success) {
      setFieldErrors(validation.errors);
      setNotice("Fix the highlighted fields before saving.");
      return null;
    }
    setSaving(true);
    setNotice("");
    try {
      const images = await Promise.all(
        pendingImages.map(async (item) => ({
          path: `${config.media.folder}/${collection.name}/${targetSlug}/${item.image.fileName}`,
          contentBase64: await blobToBase64(item.image.blob),
        })),
      );
      const result = await saveDraft(collection.name, targetSlug, {
        fields: validation.data,
        body,
        expectedDraftSha,
        images,
      });
      const publicPaths = images.map(
        (image) =>
          `${config.media.publicPath}/${collection.name}/${targetSlug}/${image.path.split("/").pop()}`,
      );
      if (publicPaths.length > 0) {
        const nextRecent = [...publicPaths, ...existingPaths]
          .filter((item, index, array) => array.indexOf(item) === index)
          .slice(0, 8);
        setExistingPaths(nextRecent);
        localStorage.setItem(recentKey(), JSON.stringify(nextRecent));
      }
      setPendingImages([]);
      setExpectedDraftSha(result.sha);
      setSource("draft");
      setEntryState("draft");
      setUnknownFields(result.unknownFields);
      setDirty(false);
      localStorage.removeItem(storageKey(collection.name, slugParam));
      if (isNew && !createdSlug) {
        // Pin the slug and point the address bar at the saved draft (without reloading the editor).
        setCreatedSlug(targetSlug);
        window.history.replaceState(
          null,
          "",
          `#/edit/${encodeURIComponent(collection.name)}/${encodeURIComponent(targetSlug)}`,
        );
      }
      if (!options.silent) setNotice("Draft saved to cms-drafts.");
      return { slug: targetSlug };
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields ?? {});
        setNotice(error.message);
      } else {
        setNotice(
          error instanceof Error ? error.message : "Could not save draft.",
        );
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publishInternal(overwrite: boolean) {
    const saved = await persistDraft({ silent: true });
    if (!saved) return;
    setPublishing(true);
    setNotice("");
    try {
      const result = await publishDraft(collection.name, saved.slug, overwrite);
      setPublishResult({
        commitUrl: result.commitUrl,
        cleanupWarning: result.cleanupWarning,
      });
      setEntryState("published");
      setSource("main");
      setExpectedDraftSha(null);
      setConflictOpen(false);
      setPublishConfirmOpen(false);
      setDirty(false);
      setNotice(result.cleanupWarning ?? "Published to main.");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "conflict") {
          setConflictOpen(true);
        } else {
          setFieldErrors(error.fields ?? {});
          setNotice(error.message);
        }
      } else {
        setNotice(
          error instanceof Error ? error.message : "Could not publish.",
        );
      }
    } finally {
      setPublishing(false);
    }
  }

  async function reloadLiveVersion() {
    const targetSlug = isNew ? (createdSlug ?? effectiveSlug) : slugParam;
    if (!targetSlug) return;
    try {
      const doc = await getEntry(collection.name, targetSlug, "main");
      setFields({ ...defaultsFor(collection), ...doc.fields });
      setBody(doc.body);
      setSource("main");
      setEntryState("published");
      setExpectedDraftSha(null);
      setUnknownFields(doc.unknownFields);
      setDirty(false);
      setPendingImages([]);
      localStorage.removeItem(storageKey(collection.name, slugParam));
      setConflictOpen(false);
      setNotice(
        "Reloaded the live version from main. Your conflicting edits were discarded.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not reload the live version.",
      );
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Loading entry…</p>
      </section>
    );
  }
  if (notFound) {
    return (
      <section className="panel">
        <h1>Entry not found</h1>
        <p className="muted">It may not exist on main or cms-drafts yet.</p>
        <a className="button" href={`#/list/${collection.name}`}>
          Back to {collection.label}
        </a>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="panel">
        <h1>Could not load entry</h1>
        <p role="alert" className="warning">
          {loadError}
        </p>
        <a className="button" href={`#/list/${collection.name}`}>
          Back to {collection.label}
        </a>
      </section>
    );
  }

  const timelinePrefix =
    collection.name === "timeline" && /^(blog-|project-)/.test(slugParam);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="kicker">{collection.label}</p>
          <h1 style={{ marginBottom: "0.25rem" }}>
            {isNew ? "New entry" : String(fields.title ?? slugParam)}
          </h1>
          <div className="toolbar" style={{ gap: "0.35rem" }}>
            <StateBadge state={entryState} />
            <span className="badge">
              {source === "draft" ? "Unpublished changes" : "Live version"}
            </span>
            {slugParam !== "new" ? (
              <code className="badge">{slugParam}</code>
            ) : (
              <code className="badge">
                {effectiveSlug || "slug from title"}
              </code>
            )}
          </div>
        </div>
        <a className="button" href={`#/list/${collection.name}`}>
          Back to list
        </a>
      </div>

      {restorePrompt ? (
        <div
          role="status"
          className="warning"
          style={{ marginBottom: "0.75rem" }}
        >
          <strong>Autosaved changes found.</strong>
          <p style={{ margin: "0.25rem 0 0.5rem" }}>
            A local copy from {new Date(restorePrompt.savedAt).toLocaleString()}{" "}
            differs from the loaded entry.
          </p>
          <div className="toolbar">
            <button
              type="button"
              onClick={() => {
                setFields(restorePrompt.fields);
                setBody(restorePrompt.body);
                setDirty(true);
                setRestorePrompt(null);
              }}
            >
              Restore local copy
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(storageKey(collection.name, slugParam));
                setRestorePrompt(null);
              }}
            >
              Discard local copy
            </button>
          </div>
        </div>
      ) : null}

      {unknownFields.length > 0 ? (
        <p role="status" className="warning">
          Unknown frontmatter fields preserved and will be written back:{" "}
          {unknownFields.join(", ")}.
        </p>
      ) : null}
      {timelinePrefix ? (
        <p role="status" className="warning">
          This timeline id starts with <code>{slugParam.split("-")[0]}-</code>,
          so it overrides the matching generated entry on the site.
        </p>
      ) : null}
      {collection.name === "pages" && slugParam === "now" ? (
        <p role="status" className="warning">
          <code>now.md</code> is special on the site. Its slug is locked.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="warning">
          {notice}
        </p>
      ) : null}
      {publishResult ? (
        <div
          role="status"
          className="panel"
          style={{ marginBottom: "0.75rem" }}
        >
          <strong>Published.</strong>{" "}
          <a href={publishResult.commitUrl} target="_blank" rel="noreferrer">
            View commit
          </a>
          {liveUrlFor(isNew ? (createdSlug ?? effectiveSlug) : slugParam) ? (
            <>
              {" "}
              ·{" "}
              <a
                href={
                  liveUrlFor(
                    isNew ? (createdSlug ?? effectiveSlug) : slugParam,
                  ) as string
                }
                target="_blank"
                rel="noreferrer"
              >
                View on site
              </a>{" "}
              <span className="muted">
                (live once the deploy below succeeds)
              </span>
            </>
          ) : null}
          {isHidden ? (
            <p className="warning">
              This entry is archived, so it is hidden from lists, the home page,
              search and RSS. Only its direct link works.
            </p>
          ) : null}
          {publishResult.cleanupWarning ? (
            <p className="warning">{publishResult.cleanupWarning}</p>
          ) : null}
          {deploy ? (
            <p className="muted">
              Deploy: <span className="badge">{deploy.status}</span> ·{" "}
              <a href={deploy.url} target="_blank" rel="noreferrer">
                workflow run
              </a>
            </p>
          ) : (
            <p className="muted">Checking deploy status…</p>
          )}
        </div>
      ) : null}

      <div className="editor-layout">
        <aside>
          <details className="details" open>
            <summary>Metadata</summary>
            <div className="grid" style={{ marginTop: "0.75rem" }}>
              {isNew && !locked ? (
                <div className="field">
                  <label htmlFor="slug-preview">File slug</label>
                  <input
                    id="slug-preview"
                    className="input"
                    value={effectiveSlug}
                    readOnly
                    aria-describedby="slug-help"
                  />
                  <p id="slug-help" className="muted">
                    {createdSlug
                      ? "Locked after the first save so edits do not create a second draft."
                      : "Derived from the title. Lowercase, hyphens, ASCII."}
                  </p>
                  {fieldErrors.slug ? (
                    <p className="error">{fieldErrors.slug}</p>
                  ) : null}
                </div>
              ) : null}
              {collection.fields.map((field) => (
                <FieldInput
                  key={field.name}
                  field={field}
                  value={fields[field.name]}
                  error={fieldErrors[field.name]}
                  onChange={setField}
                />
              ))}
            </div>
          </details>

          {pendingImages.length > 0 ? (
            <section
              className="panel"
              style={{ marginTop: "0.75rem" }}
              aria-labelledby="pending-images"
            >
              <h2
                id="pending-images"
                style={{ marginTop: 0, fontSize: "1rem" }}
              >
                Images queued with this draft
              </h2>
              <ul style={{ paddingLeft: "1.25rem", marginBottom: 0 }}>
                {pendingImages.map((item, index) => (
                  <li key={`${item.image.fileName}-${index}`}>
                    <code>{item.image.fileName}</code> — {item.alt}
                    <button
                      type="button"
                      className="danger"
                      style={{ marginLeft: "0.5rem" }}
                      onClick={() =>
                        setPendingImages((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <section className="panel" aria-label="Markdown editor">
          <div className="editor-tabs" role="tablist" aria-label="Editor mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "edit"}
              onClick={() => setTab("edit")}
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "preview"}
              onClick={() => setTab("preview")}
            >
              Preview
            </button>
            <span
              className="muted editor-stats"
              style={{ marginLeft: "auto", alignSelf: "center" }}
            >
              {stats.words} words · about {stats.minutes} min read
            </span>
          </div>
          <Toolbar
            disabled={tab !== "edit"}
            onAction={runAction}
            onImage={() => setMediaOpen(true)}
          />
          {tab === "edit" ? (
            <textarea
              ref={textareaRef}
              className="textarea editor-body"
              value={body}
              aria-label="Markdown body"
              onKeyDown={handleEditorKeyDown}
              onInput={(event) =>
                markDirty(() => setBody(event.currentTarget.value))
              }
              placeholder="Write markdown here. Use the toolbar or paste existing markdown."
            />
          ) : (
            <div className="details" style={{ minHeight: 240 }}>
              <MarkdownPreview body={body} />
            </div>
          )}
          <div className="sticky-actions" aria-label="Save and publish actions">
            <div>
              <span className="muted">{autosaveStatus}</span>
              {dirty ? (
                <span className="badge draft" style={{ marginLeft: "0.5rem" }}>
                  Unsaved
                </span>
              ) : null}
              {hasStatusField ? (
                <span
                  className={`badge ${isHidden ? "draft" : ""}`}
                  style={{ marginLeft: "0.5rem" }}
                  title="Set in Metadata, Status"
                >
                  {isHidden ? "Will be hidden (archived)" : "Will be visible"}
                </span>
              ) : null}
            </div>
            <div className="toolbar sticky-actions-buttons">
              <button
                type="button"
                className="primary"
                onClick={() => persistDraft()}
                disabled={saving || publishing}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={saving || publishing}
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>
              {!isNew || createdSlug ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => setDeleteOpen(true)}
                  disabled={saving || publishing}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <MediaPicker
        open={mediaOpen}
        existingPaths={existingPaths}
        onClose={() => setMediaOpen(false)}
        onPrepared={handlePreparedImage}
        onInsertExisting={insertExisting}
      />

      {deleteOpen ? (
        <DeleteDialog
          collection={collection.name}
          slug={isNew ? (createdSlug ?? effectiveSlug) : slugParam}
          title={String(fields.title ?? slugParam)}
          state={entryState}
          locked={Boolean(
            collection.specialSlugLocked?.includes(
              isNew ? (createdSlug ?? effectiveSlug) : slugParam,
            ),
          )}
          onClose={() => setDeleteOpen(false)}
          onDone={() => {
            setDeleteOpen(false);
            setDirty(false);
            navigate(`#/list/${collection.name}`);
          }}
        />
      ) : null}

      {publishConfirmOpen ? (
        <Modal
          title="Publish to main?"
          onClose={() => setPublishConfirmOpen(false)}
        >
          <p>
            This commits the entry and any queued images to <code>main</code>.
            The live site will update through the existing GitHub Actions
            deploy.
          </p>
          {isHidden ? (
            <p role="alert" className="warning">
              <strong>Status is "archived".</strong> The page will only work if
              someone has its direct link. It will <strong>not</strong> appear
              in your lists, on the home page, in search or in RSS. To make it
              visible, close this, set Status to "published" in Metadata, and
              publish again.
            </p>
          ) : hasStatusField ? (
            <p className="muted">
              Status is "published", so it will appear on the site once the
              deploy finishes (about a minute).
            </p>
          ) : null}
          <p className="muted">
            Saving a draft never publishes. This action is explicit and cannot
            be undone from the CMS (use Git to revert).
          </p>
          <div className="toolbar">
            <button
              type="button"
              className="primary"
              onClick={() => publishInternal(false)}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "Publish now"}
            </button>
            <button type="button" onClick={() => setPublishConfirmOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {conflictOpen ? (
        <Modal
          title="Published file changed on GitHub"
          onClose={() => setConflictOpen(false)}
        >
          <p>
            The file on <code>main</code> changed since this draft was started.
            Publishing now would overwrite those changes.
          </p>
          <div className="toolbar">
            <button type="button" onClick={reloadLiveVersion}>
              Reload live version
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => publishInternal(true)}
            >
              Overwrite and publish
            </button>
            <button type="button" onClick={() => setConflictOpen(false)}>
              Keep editing
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: preact.ComponentChildren;
  onClose: () => void;
}) {
  useModal(onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="page-header" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
