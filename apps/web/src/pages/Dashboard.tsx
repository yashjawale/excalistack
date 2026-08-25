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
import { useTheme } from "../theme";

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
 * Plus-sign icon used by the "New drawing" action.
 */
function PlusIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * Tray-arrow icon used by the import action.
 */
function ImportIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

/**
 * Sun icon shown while in dark mode (activates light mode).
 */
function SunIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/**
 * Moon icon shown while in light mode (activates dark mode).
 */
function MoonIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Dashboard listing all stored drawings with thumbnail previews and
 * management actions, framed by a sidebar holding the brand, primary
 * actions, and the theme toggle.
 */
export function Dashboard(): ReactElement {
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
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
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true" />
          Excalistack
        </div>

        <div className="sidebar-section">Drawings</div>
        <button
          className="sidebar-btn"
          disabled={busy}
          onClick={() => void handleNew()}
        >
          <PlusIcon />
          New drawing
        </button>
        <button
          className="sidebar-btn"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImportIcon />
          Import .excalidraw
        </button>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <button className="sidebar-btn" onClick={toggleTheme}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      <main className="content">
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
          <>
            <h2 className="content-heading">
              All drawings <span className="muted">({drawings.length})</span>
            </h2>
            <ul className="grid">
              {drawings.map((drawing) => (
                <li key={drawing.id} className="card">
                  <a
                    className="card-thumb-link"
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
                  </a>
                  <div className="card-body">
                    <span className="card-name">{drawing.name}</span>
                    <span className="card-meta">
                      {drawing.elementCount} element{drawing.elementCount === 1 ? "" : "s"} ·{" "}
                      {formatTimestamp(drawing.updatedAt)}
                    </span>
                    <div className="card-actions">
                      <button
                        className="btn btn-small"
                        onClick={() => void handleRename(drawing)}
                      >
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
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".excalidraw,.excalidrawplus,.json,application/json"
          hidden
          onChange={(event) => void handleImport(event)}
        />
      </main>
    </div>
  );
}
