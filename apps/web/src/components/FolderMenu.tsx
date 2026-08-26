import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

/** Gap between the trigger button and the popover, in pixels. */
const POPOVER_GAP_PX = 6;

/** Minimum distance kept between the popover and the viewport edge. */
const VIEWPORT_PADDING_PX = 8;

/** Props accepted by {@link FolderMenu}. */
export interface FolderMenuProps {
  /** Invoked when the user picks "Rename". */
  onRename: () => void;
  /** Invoked when the user picks "Delete". */
  onDelete: () => void;
  /**
   * Whether "Delete" is offered at all — the Drafts folder cannot be
   * deleted, so its menu omits the entry entirely.
   */
  canDelete: boolean;
}

/**
 * Overflow ("three dot") menu attached to a folder row in the sidebar.
 * Renders a trigger button plus a small popover with rename/delete
 * actions. Closes on outside click, Escape, or scroll.
 */
export function FolderMenu(props: FolderMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
    visibility: "hidden" | "visible";
  }>({ top: 0, left: 0, visibility: "hidden" });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
  }, [open]);

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
          <div className="menu-backdrop" />
          <div className="menu" role="menu" ref={popoverRef} style={popoverStyle}>
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
          </div>
        </>
      )}
    </div>
  );
}
