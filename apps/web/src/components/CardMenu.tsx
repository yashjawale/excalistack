import type { ReactElement } from "react";
import type { FolderSummary } from "@excalistack/shared";
import { MenuCheckIcon } from "./Icons";
import { useMenuPopover } from "../hooks/useMenuPopover";

/** Props accepted by {@link CardMenu}. */
export interface CardMenuProps {
  /** Invoked when the user picks "Rename". */
  onRename: () => void;
  /** Invoked when the user picks "Delete". */
  onDelete: () => void;
  /** URL of the `.excalidraw` download endpoint for this card. */
  downloadUrl: string;
  /** All folders, for the "Move to…" picker. */
  folders: FolderSummary[];
  /** Folder the drawing currently lives in. */
  currentFolderId: string;
  /** Invoked with the target folder id after a "Move to…" pick. */
  onMove: (folderId: string) => void;
}

/**
 * Overflow ("three dot") menu attached to a drawing card. Renders a
 * trigger button plus a small popover with rename/download/delete
 * actions and a "Move to…" folder picker view. Closes on outside click
 * or Escape.
 *
 * The popover is positioned with `fixed` coordinates measured from the
 * trigger so it is never clipped by the card's rounded corners or
 * `overflow: hidden`, flipping above the trigger when space below is
 * insufficient.
 */
export function CardMenu(props: CardMenuProps): ReactElement {
  const { open, setOpen, view, setView, popoverStyle, rootRef, triggerRef, popoverRef } = useMenuPopover();

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="card-menu-trigger"
        aria-label="Drawing actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <>
          <div className="menu-backdrop" />
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
                  onClick={() => setView("move")}
                >
                  Move to…
                </button>
                <a className="menu-item" role="menuitem" href={props.downloadUrl}>
                  Download
                </a>
                <div className="menu-separator" />
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
              </>
            ) : (
              props.folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  disabled={folder.id === props.currentFolderId}
                  onClick={() => {
                    setOpen(false);
                    props.onMove(folder.id);
                  }}
                >
                  <span className="menu-item-label">{folder.name}</span>
                  {folder.id === props.currentFolderId && <MenuCheckIcon />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
