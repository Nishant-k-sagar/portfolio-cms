import { useEffect, useRef, useState } from "preact/hooks";
import { prepareImage, type PreparedImage } from "../lib/images";
import { useModal } from "../lib/useModal";

export interface PreparedUpload {
  image: PreparedImage;
  alt: string;
}

interface Props {
  open: boolean;
  existingPaths: string[];
  onClose: () => void;
  onPrepared: (upload: PreparedUpload) => void;
  onInsertExisting: (path: string, alt: string) => void;
}

export function MediaPicker({
  open,
  existingPaths,
  onClose,
  onPrepared,
  onInsertExisting,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [existingAlt, setExistingAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useModal(onClose, open);

  // Focus the first control so keyboard users land inside the dialog.
  useEffect(() => {
    if (!open) return;
    dialogRef.current
      ?.querySelector<HTMLElement>("input,button,select,textarea")
      ?.focus();
  }, [open]);

  if (!open) return null;

  const addImage = async () => {
    setMessage("");
    if (!file) {
      setMessage("Choose an image first.");
      return;
    }
    if (!alt.trim()) {
      setMessage("Alt text is required.");
      return;
    }
    setBusy(true);
    try {
      const image = await prepareImage(file);
      onPrepared({ image, alt: alt.trim() });
      setFile(null);
      setAlt("");
      setMessage(
        image.converted
          ? "Converted to WebP and queued with the draft."
          : "Image queued with the draft. PNG/JPG kept because WebP was not smaller.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not prepare image.",
      );
    } finally {
      setBusy(false);
    }
  };

  const insertExisting = (path: string) => {
    if (!existingAlt.trim()) {
      setMessage("Alt text is required before inserting an existing image.");
      return;
    }
    onInsertExisting(path, existingAlt.trim());
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
      >
        <div className="page-header" style={{ marginBottom: "0.75rem" }}>
          <div>
            <p className="kicker">Media</p>
            <h2 id="media-picker-title" style={{ margin: 0 }}>
              Insert image
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media picker"
          >
            Close
          </button>
        </div>

        <section className="panel" aria-labelledby="upload-heading">
          <h3 id="upload-heading" style={{ marginTop: 0 }}>
            Upload to this draft
          </h3>
          <p className="muted">
            PNG and JPG are resized to 1600 px and re-encoded to WebP in the
            browser, but only when WebP is smaller. SVG, GIF and WebP keep their
            format.
          </p>
          <label className="field" htmlFor="media-file">
            <span>Image file</span>
            <input
              id="media-file"
              className="input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={(event) =>
                setFile(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>
          <label className="field" htmlFor="media-alt">
            <span>Alt text *</span>
            <input
              id="media-alt"
              className="input"
              value={alt}
              onInput={(event) => setAlt(event.currentTarget.value)}
              placeholder="Describe the image"
            />
          </label>
          <div className="toolbar">
            <button
              type="button"
              className="primary"
              onClick={addImage}
              disabled={busy}
            >
              {busy ? "Preparing…" : "Add image"}
            </button>
          </div>
        </section>

        {existingPaths.length > 0 ? (
          <section
            className="panel"
            style={{ marginTop: "0.75rem" }}
            aria-labelledby="existing-heading"
          >
            <h3 id="existing-heading" style={{ marginTop: 0 }}>
              Recent images
            </h3>
            <label className="field" htmlFor="existing-alt">
              <span>Alt text for inserted image *</span>
              <input
                id="existing-alt"
                className="input"
                value={existingAlt}
                onInput={(event) => setExistingAlt(event.currentTarget.value)}
                placeholder="Describe the image"
              />
            </label>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {existingPaths.map((path) => (
                <li key={path} className="media-item">
                  <code>{path}</code>
                  <button type="button" onClick={() => insertExisting(path)}>
                    Insert
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {message ? (
          <p role="status" className="warning" style={{ marginTop: "0.75rem" }}>
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
