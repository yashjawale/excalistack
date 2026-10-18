import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDrawing,
  createFolder,
  deleteDrawing,
  deleteFolder,
  importDrawingFile,
  listDrawings,
  listFolders,
  moveFolder,
  renameOrMoveDrawing,
  renameFolder,
  getDrawing,
  updateDrawing,
} from "../api";
import type { DrawingSummary, FolderSummary } from "@excalistack/shared";
import { DRAWING_DRAG_MIME, FOLDER_DRAG_MIME } from "../dragDrop";
import { DrawingCard } from "../components/DrawingCard";
import { EmptyFolderState } from "../components/EmptyFolderState";
import { FolderTree } from "../components/FolderTree";
import { InlineRename } from "../components/InlineRename";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { McpIndicator } from "../components/McpIndicator";
import { ImportIcon, PlusIcon, SearchIcon } from "../components/Icons";

/** localStorage key persisting the selected folder across reloads. */
const FOLDER_STORAGE_KEY = "excalistack-folder";

/** Name of the default folder every new drawing lands in. */
const DEFAULT_FOLDER_NAME = "Drafts";

/**
 * Dashboard listing the drawings of the selected folder, framed by a
 * sidebar holding the brand, the nested folder tree, and the theme
 * switcher. The selected folder persists across reloads; drawings can
 * be dragged onto folder rows, `.excalidraw` files can be dropped onto
 * the content area, and create/import actions target the active folder.
 */
export function Dashboard(): ReactElement {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDrawings, setLoadingDrawings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingHeaderFolderId, setRenamingHeaderFolderId] = useState<string | null>(null);
  const [renamingDrawingId, setRenamingDrawingId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<DrawingSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepth = useRef(0);
  const thumbnailAttempts = useRef(new Set<string>());
  const [fileDragActive, setFileDragActive] = useState(false);
  const [rootFolderDropActive, setRootFolderDropActive] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Backfill missing previews in the background. This only loads stored scene
  // data for rendering; it never mounts or navigates to the user's editor.
  useEffect(() => {
    const missing = drawings.filter((drawing) => !drawing.thumbnail && drawing.elementCount > 0);
    for (const summary of missing) {
      if (thumbnailAttempts.current.has(summary.id)) continue;
      thumbnailAttempts.current.add(summary.id);
      void (async (): Promise<void> => {
        try {
          const { generateThumbnail } = await import("../thumbnail");
          const drawing = await getDrawing(summary.id);
          if (drawing.thumbnail) return;
          const thumbnail = await generateThumbnail(drawing);
          if (!thumbnail) return;
          await updateDrawing(summary.id, { thumbnail }, drawing.updatedAt);
          setDrawings((current) =>
            current.map((item) => (item.id === summary.id ? { ...item, thumbnail } : item)),
          );
        } catch {
          // One best-effort attempt per drawing per dashboard page load.
        }
      })();
    }
  }, [drawings]);

  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;

  /** Whether a search query is active (grid shows global results). */
  const isSearching = searchInput.trim().length > 0;
  const visibleDrawings = isSearching ? (searchResults ?? []) : drawings;
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );

  // Debounced global search: fetches results while a query is active and
  // clears them as soon as the input empties. Stale responses are
  // discarded via the cancelled flag.
  useEffect(() => {
    const term = searchInput.trim();
    if (!term) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      listDrawings(undefined, term)
        .then((response) => {
          if (!cancelled) setSearchResults(response.drawings);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput]);

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

  /**
   * Reloads the drawings of the currently active folder (no-op when no
   * folder is selected yet).
   */
  const refreshCurrent = useCallback((): Promise<void> => {
    return activeFolderId ? refreshDrawings(activeFolderId) : Promise.resolve();
  }, [activeFolderId, refreshDrawings]);

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
        const active =
          stored && fresh.some((folder) => folder.id === stored) ? stored : (drafts?.id ?? null);
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

  // Keep the library view in sync with writes made through MCP or another
  // browser tab without forcing a full page reload.
  useEffect(() => {
    if (!activeFolderId) return;
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const [folderResponse, drawingResponse] = await Promise.all([
          listFolders(),
          listDrawings(
            isSearching ? undefined : activeFolderId,
            isSearching ? searchInput : undefined,
          ),
        ]);
        if (cancelled) return;
        setFolders(folderResponse.folders);
        if (isSearching) setSearchResults(drawingResponse.drawings);
        else setDrawings(drawingResponse.drawings);
      } catch {
        // Keep the last usable view; normal user-triggered requests surface errors.
      }
    };
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeFolderId, isSearching, searchInput]);

  /**
   * Switches the active folder, persists the choice, and reloads the
   * drawing list.
   *
   * @param folderId - Folder to activate.
   */
  const selectFolder = useCallback(
    (folderId: string): void => {
      setMobileSidebarOpen(false);
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
    setRenamingHeaderFolderId(null);
    if (name === folder.name) return;
    try {
      await renameFolder(folder.id, name);
      await refreshFolders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /**
   * Re-parents a folder via its row menu's "Move to…" picker.
   *
   * @param folder - Folder to move.
   * @param parentId - New parent (`null` = root).
   */
  const handleMoveFolder = async (
    folder: FolderSummary,
    parentId: string | null,
  ): Promise<void> => {
    try {
      await moveFolder(folder.id, parentId);
      await refreshFolders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /**
   * Deletes a folder after confirmation; its subtree and drawings move
   * to Drafts.
   *
   * @param folder - Folder to remove.
   */
  const handleDeleteFolder = async (folder: FolderSummary): Promise<void> => {
    if (
      !window.confirm(
        `Delete folder "${folder.name}"? Its subfolders and drawings move to ${DEFAULT_FOLDER_NAME}.`,
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
   * Starts inline creation of a new root-level folder.
   */
  const startCreateFolder = (): void => {
    setCreatingIn(null);
    setCreatingFolder(true);
    setNewFolderName("");
    requestAnimationFrame(() => newFolderInputRef.current?.focus());
  };

  /**
   * Starts inline creation of a subfolder under the given folder.
   *
   * @param folder - Folder that will contain the new subfolder.
   */
  const startCreateSubfolder = (folder: FolderSummary): void => {
    setCreatingIn(folder.id);
    setCreatingFolder(true);
    setNewFolderName("");
    requestAnimationFrame(() => newFolderInputRef.current?.focus());
  };

  /**
   * Commits the new-folder input (empty names cancel creation) and
   * selects the freshly created folder.
   */
  const commitCreateFolder = async (): Promise<void> => {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    if (!name) return;
    try {
      const folder = await createFolder(name, creatingIn ?? undefined);
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
   * Moves a drawing dropped onto a sidebar folder row.
   *
   * @param folderId - Target folder identifier.
   * @param drawingId - Identifier carried by the drag.
   */
  const handleDropDrawing = async (folderId: string, drawingId: string): Promise<void> => {
    setError(null);
    try {
      await renameOrMoveDrawing(drawingId, { folderId });
      await Promise.all([refreshFolders(), refreshCurrent()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /**
   * Starts a drag of a drawing card, carrying its id for folder drops.
   * Drags originating inside a rename input (text selection) are left
   * to the browser's native text drag.
   *
   * @param event - Drag start event on the card.
   * @param drawing - Drawing represented by the card.
   */
  const handleCardDragStart = (event: DragEvent<HTMLLIElement>, drawing: DrawingSummary): void => {
    if ((event.target as HTMLElement).closest("input")) return;
    event.dataTransfer.setData(DRAWING_DRAG_MIME, drawing.id);
    event.dataTransfer.effectAllowed = "move";
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

  /**
   * Checks whether a drag carries files (as opposed to a dragged card).
   *
   * @param event - Drag event on the content area.
   * @returns `true` when the drag contains files.
   */
  const dragHasFiles = (event: DragEvent<HTMLElement>): boolean =>
    event.dataTransfer.types.includes("Files");

  /**
   * Enters the file-drop state when files are dragged over the content.
   *
   * @param event - Drag enter event.
   */
  const handleContentDragEnter = (event: DragEvent<HTMLElement>): void => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    fileDragDepth.current += 1;
    setFileDragActive(true);
  };

  /**
   * Keeps the content area a valid drop target while files hover it.
   *
   * @param event - Drag over event.
   */
  const handleContentDragOver = (event: DragEvent<HTMLElement>): void => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  /**
   * Leaves the file-drop state once the drag fully exits the content.
   *
   * @param event - Drag leave event.
   */
  const handleContentDragLeave = (event: DragEvent<HTMLElement>): void => {
    if (!dragHasFiles(event)) return;
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (fileDragDepth.current === 0) {
      setFileDragActive(false);
    }
  };

  /**
   * Imports every dropped `.excalidraw` file into the active folder,
   * collecting per-file failures into the error banner.
   *
   * @param event - Drop event on the content area.
   */
  const handleContentDrop = async (event: DragEvent<HTMLElement>): Promise<void> => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    fileDragDepth.current = 0;
    setFileDragActive(false);
    if (!activeFolderId) return;

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      /\.(excalidraw|excalidrawplus|json)$/i.test(file.name),
    );
    if (files.length === 0) {
      setError("No .excalidraw files found in the dropped items");
      return;
    }
    setBusy(true);
    const results = await Promise.allSettled(
      files.map((file) => importDrawingFile(file, activeFolderId)),
    );
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    if (failures.length > 0) {
      setError(failures.join(" · "));
    }
    await Promise.all([refreshFolders(), refreshDrawings(activeFolderId)]);
    setBusy(false);
  };

  return (
    <div className="shell">
      <aside
        id="dashboard-sidebar"
        className={`sidebar${rootFolderDropActive ? " root-folder-drop-target" : ""}${mobileSidebarOpen ? " mobile-open" : ""}`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(FOLDER_DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setRootFolderDropActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setRootFolderDropActive(false);
          }
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(FOLDER_DRAG_MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          setRootFolderDropActive(false);
          const source = folders.find(
            (folder) => folder.id === event.dataTransfer.getData(FOLDER_DRAG_MIME),
          );
          if (source && source.name !== DEFAULT_FOLDER_NAME && source.parentId !== null) {
            void handleMoveFolder(source, null);
          }
        }}
      >
        <div className="sidebar-brand">
          <span className="brand-logo" aria-hidden="true" />
          Excalistack
          <button
            type="button"
            className="mobile-sidebar-close"
            aria-label="Close folder navigation"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="sidebar-section">Folders</div>
        <FolderTree
          folders={folders}
          activeFolderId={activeFolderId}
          renamingFolderId={renamingFolderId}
          creating={creatingFolder}
          creatingIn={creatingIn}
          newFolderName={newFolderName}
          newFolderInputRef={newFolderInputRef}
          onNewFolderNameChange={setNewFolderName}
          onNewFolderCommit={() => void commitCreateFolder()}
          onNewFolderCancel={() => setCreatingFolder(false)}
          onSelect={selectFolder}
          onStartRename={(folder) => setRenamingFolderId(folder.id)}
          onRenameCommit={(folder, name) => void handleRenameFolderCommit(folder, name)}
          onRenameCancel={() => setRenamingFolderId(null)}
          onDelete={(folder) => void handleDeleteFolder(folder)}
          onCreateSubfolder={startCreateSubfolder}
          onMoveFolder={(folder, parentId) => void handleMoveFolder(folder, parentId)}
          onDropDrawing={(folderId, drawingId) => void handleDropDrawing(folderId, drawingId)}
        />

        <button className="sidebar-btn" onClick={startCreateFolder}>
          <PlusIcon />
          New folder
        </button>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <ThemeSwitcher />
          <McpIndicator />
        </div>
      </aside>

      {mobileSidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Close folder navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <main
        className="content"
        onDragEnter={handleContentDragEnter}
        onDragOver={handleContentDragOver}
        onDragLeave={handleContentDragLeave}
        onDrop={(event) => void handleContentDrop(event)}
      >
        {fileDragActive && (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-overlay-card">Drop to import into "{activeFolder?.name}"</div>
          </div>
        )}

        {error && (
          <div role="alert" className="banner banner-error">
            {error}
          </div>
        )}

        <div className="content-header">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Open folder navigation"
            aria-expanded={mobileSidebarOpen}
            aria-controls="dashboard-sidebar"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="content-heading">
            {isSearching ? (
              <>
                Search results <span className="muted">({visibleDrawings.length})</span>
              </>
            ) : (
              <>
                {loading ? (
                  "…"
                ) : activeFolder?.name === DEFAULT_FOLDER_NAME ? (
                  activeFolder.name
                ) : activeFolder ? (
                  <InlineRename
                    value={activeFolder.name}
                    editing={renamingHeaderFolderId === activeFolder.id}
                    onStart={() => setRenamingHeaderFolderId(activeFolder.id)}
                    onCommit={(name) => void handleRenameFolderCommit(activeFolder, name)}
                    onCancel={() => setRenamingHeaderFolderId(null)}
                    className="folder-heading-name"
                    inputClassName="folder-heading-input"
                    ariaLabel="Folder name"
                    matchDisplayWidth
                  />
                ) : (
                  "…"
                )}{" "}
                <span className="muted">({drawings.length})</span>
              </>
            )}
          </h2>
          <div className="content-header-actions">
            <div className="search-wrap">
              <SearchIcon />
              <input
                className="search-input"
                value={searchInput}
                placeholder="Search drawings…"
                aria-label="Search drawings"
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchInput("");
                  }
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearchInput("")}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              )}
            </div>
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

        {isSearching ? (
          searching ? (
            <p className="muted">Searching…</p>
          ) : visibleDrawings.length === 0 ? (
            <div className="empty-state">
              <p>
                No drawings match "<code>{searchInput.trim()}</code>".
              </p>
              <p className="muted">Search covers drawing names and the text inside them.</p>
            </div>
          ) : (
            <ul className="grid">
              {visibleDrawings.map((drawing) => (
                <DrawingCard
                  key={drawing.id}
                  drawing={drawing}
                  folders={folders}
                  folderName={folderNameById.get(drawing.folderId) ?? "—"}
                  busy={busy}
                  renaming={renamingDrawingId === drawing.id}
                  onOpen={(item) => navigate(`/d/${item.id}`)}
                  onDragStart={handleCardDragStart}
                  onRename={handleRename}
                  onRenameCommit={(item, name) => void handleRenameCommit(item, name)}
                  onRenameCancel={() => setRenamingDrawingId(null)}
                  onDelete={(item) => void handleDelete(item)}
                  onMove={(item, folderId) => void handleMove(item, folderId)}
                />
              ))}
            </ul>
          )
        ) : loading || loadingDrawings ? (
          <p className="muted">Loading…</p>
        ) : !activeFolderId ? (
          <p className="muted">No folder selected.</p>
        ) : drawings.length === 0 ? (
          <EmptyFolderState folderName={activeFolder?.name} />
        ) : (
          <ul className="grid">
            {drawings.map((drawing) => (
              <DrawingCard
                key={drawing.id}
                drawing={drawing}
                folders={folders}
                busy={busy}
                renaming={renamingDrawingId === drawing.id}
                onOpen={(item) => navigate(`/d/${item.id}`)}
                onDragStart={handleCardDragStart}
                onRename={handleRename}
                onRenameCommit={(item, name) => void handleRenameCommit(item, name)}
                onRenameCancel={() => setRenamingDrawingId(null)}
                onDelete={(item) => void handleDelete(item)}
                onMove={(item, folderId) => void handleMove(item, folderId)}
              />
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
