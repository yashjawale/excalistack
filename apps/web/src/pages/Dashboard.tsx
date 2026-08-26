import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDrawing,
  createFolder,
  deleteDrawing,
  deleteFolder,
  importDrawingFile,
  listDrawings,
  listFolders,
  renameOrMoveDrawing,
  renameFolder,
} from "../api";
import type { DrawingSummary, FolderSummary } from "@excalistack/shared";
import { CardMenu } from "../components/CardMenu";
import { FolderMenu } from "../components/FolderMenu";
import { InlineRename } from "../components/InlineRename";
import { useTheme } from "../theme";

/** localStorage key persisting the selected folder across reloads. */
const FOLDER_STORAGE_KEY = "excalistack-folder";

/** Name of the default folder every new drawing lands in. */
const DEFAULT_FOLDER_NAME = "Drafts";

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
 * Plus-sign icon used by creation actions.
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
 * Folder glyph shown next to sidebar folder entries.
 */
function FolderIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
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
 * Dashboard listing the drawings of the selected folder, framed by a
 * sidebar holding the brand, folder navigation, and the theme toggle.
 * The selected folder persists across reloads via localStorage; create
 * and import actions live in the content header and always target the
 * active folder.
 */
export function Dashboard(): ReactElement {
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDrawings, setLoadingDrawings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingDrawingId, setRenamingDrawingId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;

  /**
   * Fetches folders from the API and mirrors them into state.
   *
   * @returns The fresh folder list.
   */
  const refreshFolders = useCallback(async (): Promise<FolderSummary[]> => {
    const { folders: fresh } = await listFolders();
    setFolders(fresh);
    return fresh;
  }, []);

  /**
   * Fetches the drawings of one folder into state.
   *
   * @param folderId - Folder whose drawings should be listed.
   */
  const refreshDrawings = useCallback(async (folderId: string): Promise<void> => {
    setLoadingDrawings(true);
    try {
      setDrawings((await listDrawings(folderId)).drawings);
    } finally {
      setLoadingDrawings(false);
    }
  }, []);

  // Initial load: folders first, then resolve the persisted selection
  // (falling back to Drafts), then the drawings of that folder.
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const fresh = await refreshFolders();
        if (cancelled) return;
        const stored = localStorage.getItem(FOLDER_STORAGE_KEY);
        const drafts = fresh.find((folder) => folder.name === DEFAULT_FOLDER_NAME) ?? fresh[0];
        const active = stored && fresh.some((folder) => folder.id === stored) ? stored : drafts?.id ?? null;
        setActiveFolderId(active);
        if (active) {
          localStorage.setItem(FOLDER_STORAGE_KEY, active);
          await refreshDrawings(active);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFolders, refreshDrawings]);

  /**
   * Switches the active folder, persists the choice, and reloads the
   * drawing list.
   *
   * @param folderId - Folder to activate.
   */
  const selectFolder = useCallback(
    (folderId: string): void => {
      if (folderId === activeFolderId) return;
      setActiveFolderId(folderId);
      localStorage.setItem(FOLDER_STORAGE_KEY, folderId);
      void refreshDrawings(folderId).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [activeFolderId, refreshDrawings],
  );

  /**
   * Reloads the drawings of the currently active folder (no-op when no
   * folder is selected yet).
   */
  const refreshCurrent = useCallback((): Promise<void> => {
    return activeFolderId ? refreshDrawings(activeFolderId) : Promise.resolve();
  }, [activeFolderId, refreshDrawings]);

  /**
   * Creates an empty drawing in the active folder and opens it.
   */
  const handleNew = async (): Promise<void> => {
    if (!activeFolderId) return;
    setBusy(true);
    try {
      const drawing = await createDrawing({ folderId: activeFolderId });
      navigate(`/d/${drawing.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  /**
   * Enters inline edit mode for a folder's name.
   *
   * @param folder - Folder to rename.
   */
  const handleRenameFolder = (folder: FolderSummary): void => {
    setRenamingFolderId(folder.id);
  };

  /**
   * Commits a folder rename.
   *
   * @param folder - Folder being renamed.
   * @param name - New name chosen by the user.
   */
  const handleRenameFolderCommit = async (folder: FolderSummary, name: string): Promise<void> => {
    setRenamingFolderId(null);
    if (name === folder.name) return;
    try {
      await renameFolder(folder.id, name);
      await refreshFolders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /**
   * Deletes a folder after confirmation; its drawings move to Drafts.
   *
   * @param folder - Folder to remove.
   */
  const handleDeleteFolder = async (folder: FolderSummary): Promise<void> => {
    if (
      !window.confirm(
        `Delete folder "${folder.name}"? Its ${folder.drawingCount} drawing(s) move to ${DEFAULT_FOLDER_NAME}.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteFolder(folder.id);
      const fresh = await refreshFolders();
      if (folder.id === activeFolderId) {
        const drafts = fresh.find((entry) => entry.name === DEFAULT_FOLDER_NAME) ?? fresh[0];
        if (drafts) selectFolder(drafts.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Starts inline creation of a new folder.
   */
  const startCreateFolder = (): void => {
    setCreatingFolder(true);
    setNewFolderName("");
    requestAnimationFrame(() => newFolderInputRef.current?.focus());
  };

  /**
   * Commits the new-folder input (empty names cancel creation).
   */
  const commitCreateFolder = async (): Promise<void> => {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    if (!name) return;
    try {
      const folder = await createFolder(name);
      const fresh = await refreshFolders();
      const created = fresh.find((entry) => entry.id === folder.id);
      if (created) selectFolder(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /**
   * Enters inline edit mode for a drawing's name on its card.
   *
   * @param drawing - Drawing to rename.
   */
  const handleRename = (drawing: DrawingSummary): void => {
    setRenamingDrawingId(drawing.id);
  };

  /**
   * Commits an inline card rename and refreshes the list.
   *
   * @param drawing - Drawing being renamed.
   * @param name - New name chosen by the user.
   */
  const handleRenameCommit = async (drawing: DrawingSummary, name: string): Promise<void> => {
    if (name === drawing.name) return;
    setBusy(true);
    try {
      await renameOrMoveDrawing(drawing.id, { name });
      await refreshCurrent();
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
      await Promise.all([refreshFolders(), refreshCurrent()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Moves a drawing to another folder via its card menu.
   *
   * @param drawing - Drawing to move.
   * @param folderId - Target folder identifier.
   */
  const handleMove = async (drawing: DrawingSummary, folderId: string): Promise<void> => {
    setBusy(true);
    try {
      await renameOrMoveDrawing(drawing.id, { folderId });
      await Promise.all([refreshFolders(), refreshCurrent()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Imports the selected `.excalidraw` file into the active folder.
   *
   * @param event - File input change event.
   */
  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeFolderId) return;
    setBusy(true);
    try {
      await importDrawingFile(file, activeFolderId);
      await Promise.all([refreshFolders(), refreshDrawings(activeFolderId)]);
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

        <div className="sidebar-section">Folders</div>
        <nav className="folder-list">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`folder-row${folder.id === activeFolderId ? " active" : ""}`}
            >
              {renamingFolderId === folder.id ? (
                <InlineRename
                  value={folder.name}
                  editing
                  onStart={() => undefined}
                  onCommit={(name) => void handleRenameFolderCommit(folder, name)}
                  onCancel={() => setRenamingFolderId(null)}
                  className="folder-name"
                  inputClassName="sidebar-rename-input"
                />
              ) : (
                <>
                  <button
                    className="sidebar-btn folder-btn"
                    onClick={() => selectFolder(folder.id)}
                  >
                    <FolderIcon />
                    <span className="folder-name">{folder.name}</span>
                    <span className="folder-count">{folder.drawingCount}</span>
                  </button>
                  <FolderMenu
                    canDelete={folder.name !== DEFAULT_FOLDER_NAME}
                    onRename={() => handleRenameFolder(folder)}
                    onDelete={() => void handleDeleteFolder(folder)}
                  />
                </>
              )}
            </div>
          ))}
        </nav>

        {creatingFolder ? (
          <input
            ref={newFolderInputRef}
            className="sidebar-rename-input"
            value={newFolderName}
            placeholder="Folder name"
            aria-label="New folder name"
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitCreateFolder();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setCreatingFolder(false);
              }
            }}
            onBlur={() => void commitCreateFolder()}
          />
        ) : (
          <button className="sidebar-btn" onClick={startCreateFolder}>
            <PlusIcon />
            New folder
          </button>
        )}

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

        <div className="content-header">
          <h2 className="content-heading">
            {loading ? "…" : (activeFolder?.name ?? "…")}{" "}
            <span className="muted">({drawings.length})</span>
          </h2>
          <div className="content-header-actions">
            <button
              className="btn"
              disabled={busy || !activeFolderId}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImportIcon />
              Import
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !activeFolderId}
              onClick={() => void handleNew()}
            >
              <PlusIcon />
              New drawing
            </button>
          </div>
        </div>

        {loading || loadingDrawings ? (
          <p className="muted">Loading…</p>
        ) : !activeFolderId ? (
          <p className="muted">No folder selected.</p>
        ) : drawings.length === 0 ? (
          <div className="empty-state">
            <p>Nothing in "{activeFolder?.name}" yet.</p>
            <p className="muted">
              Create a drawing or import an existing <code>.excalidraw</code> file — everything
              is stored on the server, not in your browser.
            </p>
          </div>
        ) : (
          <ul className="grid">
            {drawings.map((drawing) => (
              <li key={drawing.id} className="card">
                <CardMenu
                  downloadUrl={`/api/drawings/${encodeURIComponent(drawing.id)}/export`}
                  folders={folders}
                  currentFolderId={drawing.folderId}
                  onRename={() => handleRename(drawing)}
                  onDelete={() => void handleDelete(drawing)}
                  onMove={(folderId) => void handleMove(drawing, folderId)}
                />
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
                  <InlineRename
                    value={drawing.name}
                    editing={renamingDrawingId === drawing.id}
                    onStart={() => handleRename(drawing)}
                    onCommit={(name) => void handleRenameCommit(drawing, name)}
                    onCancel={() => setRenamingDrawingId(null)}
                    className="card-name"
                    inputClassName="card-name-input"
                  />
                  <span className="card-meta">
                    {drawing.elementCount} element{drawing.elementCount === 1 ? "" : "s"} ·{" "}
                    {formatTimestamp(drawing.updatedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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
