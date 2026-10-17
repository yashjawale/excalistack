import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactElement, RefObject } from "react";
import type { FolderSummary } from "@excalistack/shared";
import { DRAWING_DRAG_MIME, FOLDER_DRAG_MIME } from "../dragDrop";
import { FolderMenu } from "./FolderMenu";
import { InlineRename } from "./InlineRename";
import { FolderIcon } from "./Icons";
import { buildChildrenMap, canMoveFolderInto } from "../utils/folders";

/** Horizontal indentation (px) per nesting depth. */
const DEPTH_PX = 14;

/** Props accepted by {@link FolderTree}. */
export interface FolderTreeProps {
  /** Flat folder list from the API (any order). */
  folders: FolderSummary[];
  /** Currently selected folder. */
  activeFolderId: string | null;
  /** Folder currently being renamed, if any. */
  renamingFolderId: string | null;
  /** Whether the "new folder" inline input is open. */
  creating: boolean;
  /** Parent the new folder will be created under (`null` = root). */
  creatingIn: string | null;
  /** Value of the new-folder input. */
  newFolderName: string;
  /** Ref forwarded to the new-folder input for focusing. */
  newFolderInputRef: RefObject<HTMLInputElement | null>;
  onNewFolderNameChange: (name: string) => void;
  onNewFolderCommit: () => void;
  onNewFolderCancel: () => void;
  onSelect: (folderId: string) => void;
  onStartRename: (folder: FolderSummary) => void;
  onRenameCommit: (folder: FolderSummary, name: string) => void;
  onRenameCancel: () => void;
  onDelete: (folder: FolderSummary) => void;
  onCreateSubfolder: (folder: FolderSummary) => void;
  onMoveFolder: (folder: FolderSummary, parentId: string | null) => void;
  onDropDrawing: (folderId: string, drawingId: string) => void;
}

/**
 * Recursively renders the folder hierarchy in the sidebar: indentation
 * per depth, expand/collapse chevrons, inline rename, per-row menus,
 * an inline "new subfolder" input, and drawing drop targets.
 */
export function FolderTree(props: FolderTreeProps): ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [touchRootDropTarget, setTouchRootDropTarget] = useState(false);
  const nativeDragEnabled = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);
  const [menuOpenRequest, setMenuOpenRequest] = useState<{
    folderId: string;
    token: number;
  } | null>(null);
  const gestureRef = useRef<{
    folderId: string;
    x: number;
    y: number;
    armed: boolean;
    dragging: boolean;
    dragHandle: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const menuRequestTokenRef = useRef(0);
  const suppressFolderClickRef = useRef(false);
  const childrenMap = useMemo(() => buildChildrenMap(props.folders), [props.folders]);

  const requestMenuOpen = (folderId: string): void => {
    menuRequestTokenRef.current += 1;
    setMenuOpenRequest({ folderId, token: menuRequestTokenRef.current });
  };

  // Touch interaction distinguishes a stationary long press (open the folder
  // menu) from a long press followed by movement (re-parent the folder).
  useEffect(() => {
    const isPointInSidebar = (x: number, y: number): boolean => {
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      if (!sidebar) return false;
      const bounds = sidebar.getBoundingClientRect();
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    };

    const clearGesture = (): void => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      gestureRef.current = null;
      setDraggedFolderId(null);
      setDropTargetId(null);
      setTouchRootDropTarget(false);
      document.querySelector(".sidebar")?.classList.remove("touch-root-drop-target");
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (!gesture.armed) {
        if (distance <= 10) return;
        // Start horizontal touch drags immediately; vertical movement before
        // the hold threshold remains a normal sidebar scroll gesture.
        if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY) * 0.5) {
          gesture.armed = true;
        } else {
          clearGesture();
          return;
        }
      }
      if (!gesture.dragging && distance > 12) {
        gesture.dragging = true;
        setDraggedFolderId(gesture.folderId);
      }
      if (!gesture.dragging) return;

      if (event.cancelable) event.preventDefault();
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const row = hit?.closest<HTMLElement>(".folder-row[data-folder-id]");
      const targetId = row?.dataset["folderId"] ?? null;
      const insideSidebar = isPointInSidebar(event.clientX, event.clientY);
      if (targetId && canMoveFolderInto(props.folders, gesture.folderId, targetId)) {
        setDropTargetId(targetId);
        setTouchRootDropTarget(false);
        document.querySelector(".sidebar")?.classList.remove("touch-root-drop-target");
      } else {
        setDropTargetId(null);
        setTouchRootDropTarget(!targetId && insideSidebar);
        document
          .querySelector(".sidebar")
          ?.classList.toggle("touch-root-drop-target", !targetId && insideSidebar);
      }
    };

    const handlePointerUp = (event: PointerEvent): void => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const row = hit?.closest<HTMLElement>(".folder-row[data-folder-id]");
      const targetId = row?.dataset["folderId"] ?? null;
      const insideSidebar = isPointInSidebar(event.clientX, event.clientY);

      if (gesture.dragging) {
        if (event.cancelable) event.preventDefault();
        suppressFolderClickRef.current = true;
        const source = props.folders.find((folder) => folder.id === gesture.folderId);
        if (source && targetId && canMoveFolderInto(props.folders, source.id, targetId)) {
          props.onMoveFolder(source, targetId);
        } else if (
          source &&
          !targetId &&
          insideSidebar &&
          source.name !== "Drafts" &&
          source.parentId !== null
        ) {
          props.onMoveFolder(source, null);
        }
      } else if (gesture.armed && !gesture.dragHandle) {
        if (event.cancelable) event.preventDefault();
        suppressFolderClickRef.current = true;
        requestMenuOpen(gesture.folderId);
      }
      window.setTimeout(() => {
        suppressFolderClickRef.current = false;
      }, 0);
      clearGesture();
    };

    const handlePointerCancel = (): void => clearGesture();
    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      clearGesture();
    };
  }, [props.folders, props.onMoveFolder]);

  // When a subfolder creation starts under a collapsed ancestor, expand
  // the whole ancestor chain so the input row is visible.
  useEffect(() => {
    if (!props.creating) return;
    const byId = new Map(props.folders.map((folder) => [folder.id, folder]));
    setCollapsed((current) => {
      let next: Set<string> | null = null;
      let ancestor: FolderSummary | undefined = props.creatingIn
        ? byId.get(props.creatingIn)
        : undefined;
      while (ancestor) {
        if (current.has(ancestor.id)) {
          next ??= new Set(current);
          next.delete(ancestor.id);
        }
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
      return next ?? current;
    });
  }, [props.creating, props.creatingIn, props.folders]);

  /**
   * Toggles a folder's collapsed state.
   *
   * @param folderId - Folder to expand or collapse.
   */
  const toggleCollapsed = (folderId: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  /**
   * Highlights the row while a drawing drag hovers over it.
   *
   * @param event - Drag event on the row.
   * @param folderId - Folder under the cursor.
   */
  const handleDragOver = (event: DragEvent<HTMLDivElement>, folderId: string): void => {
    if (event.dataTransfer.types.includes(FOLDER_DRAG_MIME)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const source = props.folders.find((folder) => folder.id === draggedFolderId);
      const target = props.folders.find((folder) => folder.id === folderId);
      let ancestorId = target?.parentId ?? null;
      let isDescendant = false;
      while (ancestorId) {
        if (ancestorId === source?.id) {
          isDescendant = true;
          break;
        }
        ancestorId = props.folders.find((folder) => folder.id === ancestorId)?.parentId ?? null;
      }
      if (
        source &&
        target &&
        source.id !== target.id &&
        target.name !== "Drafts" &&
        source.name !== "Drafts" &&
        !isDescendant
      ) {
        event.dataTransfer.dropEffect = "move";
        setDropTargetId(folderId);
      } else {
        event.dataTransfer.dropEffect = "none";
        setDropTargetId(null);
      }
      return;
    }
    if (!event.dataTransfer.types.includes(DRAWING_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
  };

  /**
   * Clears the highlight when the drag leaves the row (ignoring moves
   * between the row's child elements).
   *
   * @param event - Drag leave event on the row.
   * @param folderId - Folder that was highlighted.
   */
  const handleDragLeave = (event: DragEvent<HTMLDivElement>, folderId: string): void => {
    if (event.dataTransfer.types.includes(FOLDER_DRAG_MIME)) event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    if (dropTargetId === folderId) {
      setDropTargetId(null);
    }
  };

  /**
   * Moves the dropped drawing into the folder.
   *
   * @param event - Drop event on the row.
   * @param folderId - Target folder.
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>, folderId: string): void => {
    if (event.dataTransfer.types.includes(FOLDER_DRAG_MIME)) {
      event.preventDefault();
      event.stopPropagation();
      setDropTargetId(null);
      const source = props.folders.find(
        (folder) => folder.id === event.dataTransfer.getData(FOLDER_DRAG_MIME),
      );
      const target = props.folders.find((folder) => folder.id === folderId);
      if (
        !source ||
        !target ||
        source.id === target.id ||
        target.name === "Drafts" ||
        source.name === "Drafts"
      )
        return;
      let ancestorId = target.parentId;
      while (ancestorId) {
        if (ancestorId === source.id) return;
        ancestorId = props.folders.find((folder) => folder.id === ancestorId)?.parentId ?? null;
      }
      props.onMoveFolder(source, target.id);
      return;
    }
    if (!event.dataTransfer.types.includes(DRAWING_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTargetId(null);
    const drawingId = event.dataTransfer.getData(DRAWING_DRAG_MIME);
    if (drawingId) {
      props.onDropDrawing(folderId, drawingId);
    }
  };

  /**
   * Renders one folder row and (when expanded) its children.
   *
   * @param folder - Folder to render.
   * @param depth - Nesting depth (0 = root level).
   * @returns The row element with its subtree.
   */
  const renderNode = (folder: FolderSummary, depth: number): ReactElement => {
    const children = childrenMap.get(folder.id) ?? [];
    const isCollapsed = collapsed.has(folder.id);
    const isRenaming = props.renamingFolderId === folder.id;
    const isDropTarget = dropTargetId === folder.id;

    // Legal re-parent targets: everything except the folder itself and
    // its descendants (moving there would create a cycle).
    const descendants = new Set<string>();
    const queue = [...children];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      descendants.add(current.id);
      queue.push(...(childrenMap.get(current.id) ?? []));
    }
    const moveTargets = props.folders.filter((entry) => !descendants.has(entry.id));

    return (
      <div key={folder.id}>
        <div
          className={`folder-row${folder.id === props.activeFolderId ? " active" : ""}${
            isDropTarget ? " drop-target" : ""
          }${draggedFolderId === folder.id ? " touch-dragging" : ""}`}
          data-folder-id={folder.id}
          onPointerDown={(event) => {
            if (
              event.pointerType !== "touch" ||
              !(event.target instanceof Element) ||
              !event.target.closest(".folder-btn")
            )
              return;
            const dragHandle = event.target.closest(".folder-drag-handle") !== null;
            const gesture = {
              folderId: folder.id,
              x: event.clientX,
              y: event.clientY,
              armed: dragHandle,
              dragging: false,
              dragHandle,
            };
            gestureRef.current = gesture;
            if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
            if (!dragHandle) {
              longPressTimerRef.current = window.setTimeout(() => {
                if (gestureRef.current === gesture) gesture.armed = true;
              }, 450);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            if (!gestureRef.current) requestMenuOpen(folder.id);
          }}
          draggable={!isRenaming && nativeDragEnabled}
          onDragStart={(event) => {
            setDraggedFolderId(folder.id);
            event.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggedFolderId(null);
            setDropTargetId(null);
            setTouchRootDropTarget(false);
          }}
          style={{ paddingLeft: depth * DEPTH_PX }}
          onDragOver={(event) => handleDragOver(event, folder.id)}
          onDragLeave={(event) => handleDragLeave(event, folder.id)}
          onDrop={(event) => handleDrop(event, folder.id)}
        >
          {children.length > 0 ? (
            <button
              type="button"
              className={`folder-chevron${isCollapsed ? " collapsed" : ""}`}
              aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
              onClick={() => toggleCollapsed(folder.id)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ) : (
            <span className="folder-chevron-spacer" />
          )}

          {isRenaming ? (
            <InlineRename
              value={folder.name}
              editing
              onStart={() => undefined}
              onCommit={(name) => props.onRenameCommit(folder, name)}
              onCancel={props.onRenameCancel}
              className="folder-name"
              inputClassName="sidebar-rename-input"
            />
          ) : (
            <>
              <button
                className="sidebar-btn folder-btn"
                onClick={(event) => {
                  if (suppressFolderClickRef.current) {
                    suppressFolderClickRef.current = false;
                    event.preventDefault();
                    return;
                  }
                  props.onSelect(folder.id);
                }}
              >
                <span className="folder-drag-handle" title="Drag to move folder">
                  <FolderIcon />
                </span>
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.drawingCount}</span>
              </button>
              <FolderMenu
                canDelete={folder.name !== "Drafts"}
                onRename={() => props.onStartRename(folder)}
                onDelete={() => props.onDelete(folder)}
                onCreateSubfolder={() => props.onCreateSubfolder(folder)}
                moveTargets={moveTargets}
                currentParentId={folder.parentId}
                onMoveFolder={(parentId) => props.onMoveFolder(folder, parentId)}
                openRequest={menuOpenRequest?.folderId === folder.id ? menuOpenRequest.token : 0}
              />
            </>
          )}
        </div>

        {!isCollapsed && children.map((child) => renderNode(child, depth + 1))}

        {!isCollapsed && props.creating && props.creatingIn === folder.id && (
          <div className="folder-row" style={{ paddingLeft: (depth + 1) * DEPTH_PX }}>
            <span className="folder-chevron-spacer" />
            <input
              ref={props.newFolderInputRef}
              className="sidebar-rename-input"
              value={props.newFolderName}
              placeholder="Folder name"
              aria-label="New subfolder name"
              onChange={(event) => props.onNewFolderNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.onNewFolderCommit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  props.onNewFolderCancel();
                }
              }}
              onBlur={props.onNewFolderCommit}
            />
          </div>
        )}
      </div>
    );
  };

  const roots = childrenMap.get(null) ?? [];

  return (
    <nav className={`folder-list${touchRootDropTarget ? " touch-root-drop-target" : ""}`}>
      {roots.map((folder) => renderNode(folder, 0))}
      {props.creating && props.creatingIn === null && (
        <div className="folder-row">
          <span className="folder-chevron-spacer" />
          <input
            ref={props.newFolderInputRef}
            className="sidebar-rename-input"
            value={props.newFolderName}
            placeholder="Folder name"
            aria-label="New folder name"
            onChange={(event) => props.onNewFolderNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onNewFolderCommit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                props.onNewFolderCancel();
              }
            }}
            onBlur={props.onNewFolderCommit}
          />
        </div>
      )}
    </nav>
  );
}
