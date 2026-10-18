import type { ReactElement } from "react";

interface EmptyFolderStateProps {
  folderName?: string;
}

export function EmptyFolderState({ folderName }: EmptyFolderStateProps): ReactElement {
  return (
    <div className="empty-state empty-state-folder">
      <img className="empty-state-image" src="/fallback.svg" alt="" />
      <p className="empty-state-title">Nothing in "{folderName}" yet.</p>
      <p className="muted">
        Create a drawing or drop an <code>.excalidraw</code> file here — everything is stored on the
        server, not in your browser.
      </p>
    </div>
  );
}
