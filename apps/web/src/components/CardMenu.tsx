import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

/** Props accepted by {@link CardMenu}. */
export interface CardMenuProps {
  /** Invoked when the user picks "Rename". */
  onRename: () => void;
  /** Invoked when the user picks "Delete". */
  onDelete: () => void;
  /** URL of the `.excalidraw` download endpoint for this card. */
  downloadUrl: string;
}

/**
 * Overflow ("three dot") menu attached to a drawing card. Renders a
 * trigger button plus a small dropdown with rename/download/delete
 * actions. Closes on outside click or Escape.
 */
export function CardMenu(props: CardMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

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

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
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
          <div className="menu" role="menu">
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
          </div>
        </>
      )}
    </div>
  );
}
