import type { ReactElement } from "react";
import type { FolderSummary } from "@excalistack/shared";
import { useMenuPopover } from "../hooks/useMenuPopover";
import { MenuCheckIcon } from "./Icons";


/** Props accepted by {@link FolderMenu}. */
export interface FolderMenuProps {
  /** Invoked when the user picks "Rename". */
  onRename: () => void;
  /** Invoked when the user picks "Delete". */
  onDelete: () => void;
  /** Invoked when the user picks "New subfolder". */
  onCreateSubfolder: () => void;
  /**
   * Whether "Delete" is offered at all — the Drafts folder cannot be
   * deleted, so its menu omits the entry entirely.
   */
  canDelete: boolean;
  /** Legal re-parent targets (already excludes the folder's subtree). */
  moveTargets: FolderSummary[];
  /** Current parent of the folder (`null` = root). */
  currentParentId: string | null;
  /** Invoked with the new parent (`null` = root) after a move pick. */
  onMoveFolder: (parentId: string | null) => void;
  /** Incrementing request token used to open the menu from a touch gesture. */
  openRequest?: number;
}

/**
 * Overflow ("three dot") menu attached to a folder row in the sidebar.
 * Offers rename, new-subfolder, delete, and a "Move to…" re-parenting
 * picker. Closes on outside click, Escape, or scroll.
 */
export function FolderMenu(props: FolderMenuProps): ReactElement {
  const { open, setOpen, view, setView, popoverStyle, rootRef, triggerRef, popoverRef } = useMenuPopover(props.openRequest);

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="folder-menu-trigger"
        aria-label="Folder actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="menu-backdrop"
            onPointerDown={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="menu" role="menu" ref={popoverRef} style={popoverStyle}>
            {view === "actions" ? (
              <>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    props.onRename();
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    props.onCreateSubfolder();
                  }}
                >
                  New subfolder
                </button>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => setView("move")}
                >
                  Move to…
                </button>
                {props.canDelete && (
                  <button
                    type="button"
                    className="menu-item menu-item-danger"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      props.onDelete();
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  disabled={props.currentParentId === null}
                  onClick={() => {
                    setOpen(false);
                    props.onMoveFolder(null);
                  }}
                >
                  <span className="menu-item-label">Root level</span>
                  {props.currentParentId === null && <MenuCheckIcon />}
                </button>
                {props.moveTargets.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    disabled={folder.id === props.currentParentId}
                    onClick={() => {
                      setOpen(false);
                      props.onMoveFolder(folder.id);
                    }}
                  >
                    <span className="menu-item-label">{folder.name}</span>
                    {folder.id === props.currentParentId && <MenuCheckIcon />}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
