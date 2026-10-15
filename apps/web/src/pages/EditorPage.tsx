import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Excalidraw,
  exportToBlob,
  restore,
} from "@excalidraw/excalidraw";
// Component styles for the canvas; loaded only on editor pages so the
// dashboard does not pull in the excalidraw stylesheet.
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  BinaryFileData,
  BinaryFiles,
  AppState,
} from "@excalidraw/excalidraw/types";
import { ExcalidrawDocumentSchema, pickExportAppState } from "@excalistack/shared";
import type { StoredDrawing } from "@excalistack/shared";
import { getDrawing, renameOrMoveDrawing, updateDrawing } from "../api";
import { InlineRename } from "../components/InlineRename";
import { McpIndicator } from "../components/McpIndicator";
import { useTheme } from "../theme";

/** Debounce window (ms) applied before an autosave round-trip starts. */
const AUTOSAVE_DEBOUNCE_MS = 800;

/** Target width (px) of generated dashboard thumbnails. */
const THUMBNAIL_WIDTH = 320;

/** Lifecycle state of the current drawing session. */
type EditorStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/**
 * Latest scene snapshot captured from Excalidraw's `onChange`.
 */
interface SceneSnapshot {
  elements: readonly Readonly<Record<string, unknown>>[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
}

/**
 * Converts a Blob into a base64 data URL.
 *
 * @param blob - Blob to read.
 * @returns Data URL representation of the blob.
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders a small PNG preview of the scene for dashboard listings.
 *
 * @param elements - Live scene elements.
 * @param appState - Current editor state.
 * @returns Thumbnail data URL, or `null` for empty scenes.
 */
async function generateThumbnail(
  elements: SceneSnapshot["elements"],
  appState: Record<string, unknown>,
  files: BinaryFiles,
): Promise<string | null> {
  const live = elements.filter((element) => !element["isDeleted"]);
  if (live.length === 0) return null;
  const blob = await exportToBlob({
    elements: live as SceneSnapshot["elements"],
    appState: { ...appState, exportWithDarkMode: false } as Partial<AppState>,
    files,
    mimeType: "image/png",
    exportPadding: 8,
    getDimensions: (width: number, height: number) => ({
      width: THUMBNAIL_WIDTH,
      height: Math.max(1, Math.round((height / width) * THUMBNAIL_WIDTH)),
    }),
  });
  return blobToDataURL(blob);
}

/**
 * Green check icon indicating that every change has been saved.
 */
function CheckIcon(): ReactElement {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" opacity="0.3" />
      <path d="m8.3 12.3 2.5 2.5 5-5.6" />
    </svg>
  );
}

/**
 * Full-screen Excalidraw editor bound to a single stored drawing.
 * Changes are debounced-autosaved to the server together with a freshly
 * rendered thumbnail; `.excalidraw` files can be imported by dragging
 * them onto the canvas.
 */
export function EditorPage(): ReactElement {
  const { id = "" } = useParams();
  const [, theme] = useTheme();
  const [drawing, setDrawing] = useState<StoredDrawing | null>(null);
  const [status, setStatus] = useState<EditorStatus>({ kind: "loading" });
  const [flash, setFlash] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const externalSceneUpdateRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Persists the latest snapshot to the server immediately.
   */
  const saveNow = useCallback(async (): Promise<void> => {
    const snapshot = latestSceneRef.current;
    if (!snapshot || !dirtyRef.current) return;
    dirtyRef.current = false;
    savingRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const thumbnail = await generateThumbnail(
        snapshot.elements,
        snapshot.appState,
        snapshot.files,
      );
      const updated = await updateDrawing(id, {
        scene: {
          elements: snapshot.elements as StoredDrawing["scene"]["elements"],
          appState: pickExportAppState(snapshot.appState),
        },
        files: snapshot.files as StoredDrawing["files"],
        thumbnail,
      });
      setDrawing(updated);
      setStatus({ kind: "saved" });
    } catch (cause) {
      dirtyRef.current = true;
      setStatus({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      savingRef.current = false;
    }
  }, [id]);

  // Pull external edits (including MCP saves) into the open canvas. Never
  // replace a scene while the user has unsaved local edits.
  useEffect(() => {
    if (!drawing) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (dirtyRef.current || savingRef.current) return;
      void getDrawing(id).then((latest) => {
        if (cancelled || latest.updatedAt <= (drawing?.updatedAt ?? 0)) return;
        const api = apiRef.current;
        if (api) {
          externalSceneUpdateRef.current = true;
          api.updateScene({
            elements: latest.scene.elements as never,
            appState: latest.scene.appState as never,
          });
          api.addFiles(Object.values(latest.files ?? {}) as BinaryFileData[]);
          window.setTimeout(() => { externalSceneUpdateRef.current = false; }, 0);
        }
        setDrawing(latest);
      }).catch(() => {
        // Temporary network failures should not interrupt editing.
      });
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [drawing, id]);

  /**
   * Captures a scene snapshot and schedules a debounced autosave.
   */
  const scheduleSave = useCallback(
    (elements: SceneSnapshot["elements"], appState: Record<string, unknown>): void => {
      const api = apiRef.current;
      if (!api) return;
      latestSceneRef.current = {
        elements,
        appState,
        files: api.getFiles(),
      };
      dirtyRef.current = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void saveNow();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveNow],
  );

  // Flush pending changes when leaving the editor.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      void saveNow();
    };
  }, [saveNow]);

  // Load the drawing once.
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    getDrawing(id)
      .then((loaded) => {
        if (!cancelled) setDrawing(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Drag-and-drop import of .excalidraw documents onto the editor.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiRef.current) return;

    const prevent = (event: DragEvent): void => event.preventDefault();
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file || !/\.(excalidraw|json|excalidrawplus)$/i.test(file.name)) return;
        void file.text().then(async (text) => {
          try {
            const parsed = ExcalidrawDocumentSchema.safeParse(JSON.parse(text));
            if (!parsed.success) throw new Error("Not a valid .excalidraw document");
            const restored = restore(parsed.data as never, null, null);
            const api = apiRef.current;
            if (!api) return;
            api.updateScene({ elements: restored.elements as never });
            api.addFiles(Object.values(restored.files ?? {}) as BinaryFileData[]);
            setFlash(`Imported "${file.name}"`);
            window.setTimeout(() => setFlash(null), 2500);
          } catch (cause) {
            setFlash(cause instanceof Error ? cause.message : String(cause));
            window.setTimeout(() => setFlash(null), 3500);
          }
        });
    };

    container.addEventListener("dragover", prevent);
    container.addEventListener("drop", drop);
    return () => {
      container.removeEventListener("dragover", prevent);
      container.removeEventListener("drop", drop);
    };
  }, [drawing]);

  /**
   * Commits an inline title rename against the API.
   *
   * @param name - New name chosen by the user.
   */
  const handleRenameCommit = useCallback(
    async (name: string): Promise<void> => {
      setRenaming(false);
      if (!drawing || name === drawing.name) return;
      try {
        const updated = await renameOrMoveDrawing(drawing.id, { name });
        setDrawing({ ...drawing, ...updated });
        setStatus({ kind: "saved" });
      } catch (cause) {
        setStatus({
          kind: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
    [drawing],
  );

  return (
    <div className="editor-layout">
      <header className="editor-topbar">
        <Link className="btn btn-small" to="/">
          ← All drawings
        </Link>
        {drawing ? (
          <InlineRename
            value={drawing.name}
            editing={renaming}
            onStart={() => setRenaming(true)}
            onCommit={(name) => void handleRenameCommit(name)}
            onCancel={() => setRenaming(false)}
            className="editor-title"
            inputClassName="editor-title-input"
          />
        ) : (
          <span className="editor-title">
            {status.kind === "loading" ? "Loading…" : "…"}
          </span>
        )}
        <div className="editor-status">
          <McpIndicator />
          {status.kind === "saving" && (
            <span className="status status-saving" title="Saving…">
              <span className="save-dot" />
            </span>
          )}
          {status.kind === "saved" && (
            <span className="status status-ok" title="All changes saved">
              <CheckIcon />
            </span>
          )}
          {status.kind === "error" && (
            <span className="status status-error" title={status.message}>
              {drawing ? "Save failed" : "Load failed"}
            </span>
          )}
        </div>
      </header>

      {drawing && (
        <div className="editor-container" ref={containerRef}>
          <Excalidraw
            theme={theme}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={{
              elements: drawing.scene.elements as never,
              appState: drawing.scene.appState as never,
              files: drawing.files as never,
            }}
            onChange={(elements, appState) => {
              if (externalSceneUpdateRef.current) return;
              scheduleSave(elements, appState as unknown as Record<string, unknown>);
            }}
          />
          {flash && <div className="editor-flash">{flash}</div>}
        </div>
      )}
    </div>
  );
}
