import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { FolderSummary } from "@excalistack/shared";
import { MenuCheckIcon } from "./Icons";

/** Gap between the trigger button and the popover, in pixels. */
const POPOVER_GAP_PX = 6;

/** Minimum distance kept between the popover and the viewport edge. */
const VIEWPORT_PADDING_PX = 8;

/** Which content the popover currently shows. */
type MenuView = "actions" | "move";

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
