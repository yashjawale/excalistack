import { useRef, type DragEvent, type PointerEvent, type ReactElement } from "react";
import type { DrawingSummary, FolderSummary } from "@excalistack/shared";
import { CardMenu } from "./CardMenu";
import { InlineRename } from "./InlineRename";
import { formatTimestamp } from "../utils";

export interface DrawingCardProps {
  drawing: DrawingSummary;
  folders: FolderSummary[];
  folderName?: string;
  busy: boolean;
  renaming: boolean;
  onOpen: (drawing: DrawingSummary) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>, drawing: DrawingSummary) => void;
  onRename: (drawing: DrawingSummary) => void;
  onRenameCommit: (drawing: DrawingSummary, name: string) => void;
  onRenameCancel: () => void;
  onDelete: (drawing: DrawingSummary) => void;
  onMove: (drawing: DrawingSummary, folderId: string) => void;
}

/** A library card with preview, metadata, inline rename, and actions. */
export function DrawingCard(props: DrawingCardProps): ReactElement {
  const { drawing } = props;
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLLIElement>) => {
    if (event.pointerType !== "touch") return;
    const card = event.currentTarget;
    longPressTriggered.current = false;
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      card.querySelector<HTMLButtonElement>(".card-menu-trigger")?.click();
    }, 450);
  };

  return (
    <li
      className="card"
      draggable={!props.busy}
      onDragStart={(event) => props.onDragStart(event, drawing)}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerMove={cancelLongPress}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelLongPress();
        if (!longPressTriggered.current) {
          event.currentTarget.querySelector<HTMLButtonElement>(".card-menu-trigger")?.click();
        }
        longPressTriggered.current = false;
      }}
    >
      <CardMenu
        downloadUrl={`/api/drawings/${encodeURIComponent(drawing.id)}/export`}
        folders={props.folders}
        currentFolderId={drawing.folderId}
        onRename={() => props.onRename(drawing)}
        onDelete={() => props.onDelete(drawing)}
        onMove={(folderId) => props.onMove(drawing, folderId)}
      />
      <a
        className="card-thumb-link"
        href={`/d/${drawing.id}`}
        onClick={(event) => {
          event.preventDefault();
          props.onOpen(drawing);
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
          editing={props.renaming}
          onStart={() => props.onRename(drawing)}
          onCommit={(name) => props.onRenameCommit(drawing, name)}
          onCancel={props.onRenameCancel}
          className="card-name"
          inputClassName="card-name-input"
        />
        <span className="card-meta">
          {props.folderName && `${props.folderName} · `}
          {drawing.elementCount} element{drawing.elementCount === 1 ? "" : "s"} ·{" "}
          {formatTimestamp(drawing.updatedAt)}
        </span>
      </div>
    </li>
  );
}
