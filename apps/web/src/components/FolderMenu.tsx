import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { FolderSummary } from "@excalistack/shared";

/** Gap between the trigger button and the popover, in pixels. */
const POPOVER_GAP_PX = 6;

/** Minimum distance kept between the popover and the viewport edge. */
const VIEWPORT_PADDING_PX = 8;

/** Which content the popover currently shows. */
type MenuView = "actions" | "move";

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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("actions");
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
    visibility: "hidden" | "visible";
  }>({ top: 0, left: 0, visibility: "hidden" });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Return to the action list whenever the menu closes.
  useEffect(() => {
    if (!open) {
      setView("actions");
    }
  }, [open]);

  useEffect(() => {
    if (props.openRequest) setOpen(true);
  }, [props.openRequest]);

  // Position the popover next to the trigger once it is mounted.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const popover = popoverRef.current?.getBoundingClientRect();
    if (!trigger || !popover) return;

    const belowTop = trigger.bottom + POPOVER_GAP_PX;
    const fitsBelow = belowTop + popover.height <= window.innerHeight - VIEWPORT_PADDING_PX;
    const top = fitsBelow ? belowTop : trigger.top - popover.height - POPOVER_GAP_PX;
    const left = Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(trigger.right - popover.width, window.innerWidth - popover.width - VIEWPORT_PADDING_PX),
    );
    setPopoverStyle({ top, left, visibility: "visible" });
  }, [open, view]);

  useEffect(() => {
    if (!open) return;

    /**
     * Closes the menu on scroll anywhere in the document — the popover
     * is positioned with fixed viewport coordinates that would otherwise
     * go stale and detach from its trigger.
     */
    const handleScroll = (): void => {
      setOpen(false);
    };

    /**
     * Closes the menu when clicking anywhere outside of it.
     *
     * @param event - Document pointer event.
     */
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    /**
     * Closes the menu on Escape.
     *
     * @param event - Keyboard event.
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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

/**
 * Accent-colored check mark marking the current selection.
 */
function MenuCheckIcon(): ReactElement {
  return (
    <svg
      className="menu-check"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
