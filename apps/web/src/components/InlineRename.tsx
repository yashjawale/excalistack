import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";

/** Props accepted by {@link InlineRename}. */
export interface InlineRenameProps {
  /** Currently committed display value. */
  value: string;
  /** Whether the field is currently in edit mode. */
  editing: boolean;
  /** Invoked when the user activates the display text. */
  onStart: () => void;
  /** Invoked with a trimmed, changed value on commit. */
  onCommit: (value: string) => void;
  /** Invoked when editing is aborted or yields no change. */
  onCancel: () => void;
  /** Class applied to the display element. */
  className: string;
  /** Class applied to the edit input. */
  inputClassName: string;
  /** Accessible name for the edit input. */
  ariaLabel?: string;
  /** Keep the input the same width as the display label. */
  matchDisplayWidth?: boolean;
}

/**
 * Click-to-edit text field used for renaming drawings in place — the
 * input replaces the label at its exact position instead of opening a
 * dialog. Enter or blur commits, Escape cancels.
 */
export function InlineRename(props: InlineRenameProps): ReactElement {
  const [draft, setDraft] = useState(props.value);
  const [displayWidth, setDisplayWidth] = useState<number>();
  const displayRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = (): void => {
    if (props.matchDisplayWidth) {
      setDisplayWidth(displayRef.current?.getBoundingClientRect().width);
    }
    props.onStart();
  };

  useEffect(() => {
    if (props.editing) {
      setDraft(props.value);
      // Focus after mount; select all so typing replaces immediately.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [props.editing, props.value]);

  /**
   * Commits the draft when it is non-empty and actually changed.
   */
  const submit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === props.value) {
      props.onCancel();
    } else {
      props.onCommit(trimmed);
    }
  };

  /**
   * Handles keyboard submission and cancellation.
   *
   * @param event - Keydown event on the input.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    }
  };

  if (!props.editing) {
    return (
      <span
        ref={displayRef}
        className={props.className}
        title="Click to rename"
        onClick={startEditing}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            startEditing();
          }
        }}
      >
        {props.value}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className={props.inputClassName}
      style={props.matchDisplayWidth && displayWidth ? { width: displayWidth } : undefined}
      value={draft}
      aria-label={props.ariaLabel ?? "Drawing name"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={submit}
      onKeyDown={handleKeyDown}
    />
  );
}
