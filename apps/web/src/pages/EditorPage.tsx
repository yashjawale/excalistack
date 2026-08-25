import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  BinaryFileData,
  BinaryFiles,
  AppState,
} from "@excalidraw/excalidraw/types";
import { ExcalidrawDocumentSchema, pickExportAppState } from "@excalistack/shared";
import type { StoredDrawing } from "@excalistack/shared";
import { getDrawing, updateDrawing } from "../api";

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
 * Triggers a browser download for the given payload.
 *
 * @param body - File content.
 * @param filename - Suggested download file name.
 */
function download(body: Blob | string, filename: string): void {
  const blob = typeof body === "string" ? new Blob([body]) : body;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
 * Full-screen Excalidraw editor bound to a single stored drawing.
 * Changes are debounced-autosaved to the server together with a freshly
 * rendered thumbnail; `.excalidraw`/PNG/SVG export and drag-and-drop
 * import are available from the toolbar.
 */
export function EditorPage(): ReactElement {
  const { id = "" } = useParams();
  const [drawing, setDrawing] = useState<StoredDrawing | null>(null);
  const [status, setStatus] = useState<EditorStatus>({ kind: "loading" });
  const [flash, setFlash] = useState<string | null>(null);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Persists the latest snapshot to the server immediately.
   */
  const saveNow = useCallback(async (): Promise<void> => {
    const snapshot = latestSceneRef.current;
    if (!snapshot || !dirtyRef.current) return;
    dirtyRef.current = false;
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
    }
  }, [id]);

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
   * Exports the current scene as a native `.excalidraw` file.
   */
  const handleExportExcalidraw = (): void => {
    const api = apiRef.current;
    if (!api || !drawing) return;
    const json = serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
    download(json, `${drawing.name}.excalidraw`);
  };

  /**
   * Exports the current scene as a 2x-scale PNG image.
   */
  const handleExportPng = async (): Promise<void> => {
    const api = apiRef.current;
    if (!api || !drawing) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
      getDimensions: (width: number, height: number) => ({
        width,
        height,
        scale: 2,
      }),
    });
    download(blob, `${drawing.name}.png`);
  };

  /**
   * Exports the current scene as an SVG document.
   */
  const handleExportSvg = async (): Promise<void> => {
    const api = apiRef.current;
    if (!api || !drawing) return;
    const svg = await exportToSvg({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    });
    download(svg.outerHTML, `${drawing.name}.svg`);
  };

  return (
    <div className="editor-layout">
      <header className="editor-topbar">
        <Link className="btn btn-small" to="/">
          ← All drawings
        </Link>
        <span className="editor-title">{drawing?.name ?? "…"}</span>
        <div className="editor-actions">
          <button className="btn btn-small" onClick={() => void handleExportSvg()}>
            SVG
          </button>
          <button className="btn btn-small" onClick={() => void handleExportPng()}>
            PNG
          </button>
          <button className="btn btn-small btn-primary" onClick={handleExportExcalidraw}>
            Export .excalidraw
          </button>
          {status.kind === "saving" && <span className="status">Saving…</span>}
          {status.kind === "saved" && <span className="status status-ok">Saved</span>}
          {status.kind === "error" && (
            <span className="status status-error" title={status.message}>
              Save failed
            </span>
          )}
        </div>
      </header>

      {status.kind === "loading" && <p className="muted editor-loading">Loading…</p>}
      {status.kind === "error" && !drawing && (
        <p className="muted editor-loading">{status.message}</p>
      )}

      {drawing && (
        <div className="editor-container" ref={containerRef}>
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={{
              elements: drawing.scene.elements as never,
              appState: drawing.scene.appState as never,
              files: drawing.files as never,
            }}
            onChange={(elements, appState) =>
              scheduleSave(elements, appState as unknown as Record<string, unknown>)
            }
          />
          {flash && <div className="editor-flash">{flash}</div>}
        </div>
      )}
    </div>
  );
}
