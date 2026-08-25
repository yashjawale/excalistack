import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDrawing,
  deleteDrawing,
  importDrawingFile,
  listDrawings,
  renameDrawing,
} from "../api";
import type { DrawingSummary } from "@excalistack/shared";

/**
 * Formats an epoch timestamp as a short locale date/time string.
 *
 * @param epochMillis - Timestamp in epoch milliseconds.
 * @returns Human-readable local date/time.
 */
function formatTimestamp(epochMillis: number): string {
  return new Date(epochMillis).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Dashboard listing all stored drawings with thumbnail previews and
 * management actions (open, create, rename, download, delete, import).
 */
export function Dashboard(): ReactElement {
  const navigate = useNavigate();
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reloads the drawing list, surfacing failures via the error banner.
   */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setDrawings((await listDrawings()).drawings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Creates an empty drawing and opens it in the editor.
   */
  const handleNew = async (): Promise<void> => {
    setBusy(true);
    try {
      const drawing = await createDrawing({});
      navigate(`/d/${drawing.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  /**
   * Renames a drawing after asking the user for the new name.
   *
   * @param drawing - Drawing to rename.
   */
  const handleRename = async (drawing: DrawingSummary): Promise<void> => {
    const name = window.prompt("Rename drawing", drawing.name)?.trim();
    if (!name || name === drawing.name) return;
    setBusy(true);
    try {
      await renameDrawing(drawing.id, name);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Deletes a drawing after explicit user confirmation.
   *
   * @param drawing - Drawing to remove.
   */
  const handleDelete = async (drawing: DrawingSummary): Promise<void> => {
    if (!window.confirm(`Delete "${drawing.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteDrawing(drawing.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Imports the selected `.excalidraw` file as a new stored drawing.
   *
   * @param event - File input change event.
   */
  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await importDrawingFile(file);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Excalistack
        </h1>
        <div className="topbar-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import .excalidraw
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void handleNew()}>
            New drawing
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".excalidraw,.excalidrawplus,.json,application/json"
            hidden
            onChange={(event) => void handleImport(event)}
          />
        </div>
      </header>

      {error && (
        <div role="alert" className="banner banner-error">
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading drawings…</p>
      ) : drawings.length === 0 ? (
        <div className="empty-state">
          <p>No drawings yet.</p>
          <p className="muted">
            Create one, or import an existing <code>.excalidraw</code> file — everything is
            stored on the server, not in your browser.
          </p>
        </div>
      ) : (
        <ul className="grid">
          {drawings.map((drawing) => (
            <li key={drawing.id} className="card">
              <a
                className="card-link"
                href={`/d/${drawing.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/d/${drawing.id}`);
                }}
              >
                {drawing.thumbnail ? (
                  <img className="card-thumb" src={drawing.thumbnail} alt="" />
                ) : (
                  <div className="card-thumb card-thumb-empty" aria-hidden="true">
                    empty
                  </div>
                )}
                <span className="card-name">{drawing.name}</span>
              </a>
              <span className="card-meta">
                {drawing.elementCount} element{drawing.elementCount === 1 ? "" : "s"} ·{" "}
                {formatTimestamp(drawing.updatedAt)}
              </span>
              <div className="card-actions">
                <button className="btn btn-small" onClick={() => void handleRename(drawing)}>
                  Rename
                </button>
                <a
                  className="btn btn-small"
                  href={`/api/drawings/${encodeURIComponent(drawing.id)}/export`}
                >
                  Download
                </a>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => void handleDelete(drawing)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
