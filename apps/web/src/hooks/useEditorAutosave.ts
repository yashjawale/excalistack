import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { exportToBlob, restore } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AppState, BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import { pickExportAppState } from "@excalistack/shared";
import type { StoredDrawing } from "@excalistack/shared";
import { getDrawing, updateDrawing } from "../api";
import { normalizeSceneElements } from "../normalizeSceneElements";
import { blobToDataURL } from "../utils";

const AUTOSAVE_DEBOUNCE_MS = 1500;
const THUMBNAIL_WIDTH = 320;

type EditorStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

interface SceneSnapshot {
  elements: readonly Readonly<Record<string, unknown>>[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
}

interface UseEditorAutosaveOptions {
  id: string;
  theme: "light" | "dark";
  drawing: StoredDrawing | null;
  setDrawing: (drawing: StoredDrawing) => void;
  setStatus: (status: EditorStatus) => void;
  setFlash: (message: string | null) => void;
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  externalSceneUpdateRef: MutableRefObject<boolean>;
}

async function generateThumbnail(
  elements: SceneSnapshot["elements"],
  files: BinaryFiles,
): Promise<string | null> {
  const live = elements.filter((element) => !element["isDeleted"]);
  if (live.length === 0) return null;
  const blob = await exportToBlob({
    elements: live as SceneSnapshot["elements"],
    appState: {
      theme: "light",
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: "#ffffff",
    } as Partial<AppState>,
    files,
    mimeType: "image/png",
    exportPadding: 8,
    getDimensions: (width: number, height: number) => ({
      width: THUMBNAIL_WIDTH,
      height: Math.max(1, Math.round((height / width) * THUMBNAIL_WIDTH)),
      scale: THUMBNAIL_WIDTH / width,
    }),
  });
  return blobToDataURL(blob);
}

/** Owns editor autosaving, remote-update polling, and save-conflict handling. */
export function useEditorAutosave(options: UseEditorAutosaveOptions): {
  scheduleSave: (elements: SceneSnapshot["elements"], appState: Record<string, unknown>) => void;
  markLoaded: (drawing: StoredDrawing) => void;
} {
  const { apiRef, externalSceneUpdateRef, theme, id, drawing, setDrawing, setStatus, setFlash } = options;
  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const knownUpdatedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    knownUpdatedAtRef.current = 0;
  }, [id]);

  const applyRemoteDrawing = useCallback((latest: StoredDrawing, explainConflict = false): void => {
    knownUpdatedAtRef.current = latest.updatedAt;
    dirtyRef.current = false;
    latestSceneRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const api = apiRef.current;
    if (api) {
      const restored = restore({
        type: "excalidraw",
        version: 2,
        source: "https://github.com/yash/excalistack",
        elements: normalizeSceneElements(latest.scene.elements),
        appState: { ...latest.scene.appState, viewBackgroundColor: "#ffffff" },
        files: latest.files,
      } as never, null, null);
      externalSceneUpdateRef.current = true;
      api.updateScene({
        elements: restored.elements as never,
        appState: {
          ...restored.appState,
          theme,
          viewBackgroundColor: "#ffffff",
        } as never,
      });
      api.addFiles(Object.values(restored.files ?? {}) as BinaryFileData[]);
      window.requestAnimationFrame(() => {
        api.scrollToContent(restored.elements as never, {
          fitToViewport: true,
          viewportZoomFactor: 0.8,
          animate: false,
        });
        window.setTimeout(() => { externalSceneUpdateRef.current = false; }, 300);
      });
    }
    setDrawing(latest);
    setStatus({ kind: "saved" });
    if (explainConflict) {
      setFlash("Updated from MCP; unsaved local edits were replaced.");
      window.setTimeout(() => setFlash(null), 4000);
    }
  }, [apiRef, externalSceneUpdateRef, setDrawing, setFlash, setStatus, theme]);

  const saveNow = useCallback(async (): Promise<void> => {
    const snapshot = latestSceneRef.current;
    if (!snapshot || !dirtyRef.current) return;
    dirtyRef.current = false;
    savingRef.current = true;
    setStatus({ kind: "saving" });
    try {
      const expectedUpdatedAt = knownUpdatedAtRef.current;
      const latest = await getDrawing(id);
      if (latest.updatedAt > expectedUpdatedAt) {
        applyRemoteDrawing(latest, true);
        return;
      }
      const thumbnail = await generateThumbnail(snapshot.elements, snapshot.files);
      const updated = await updateDrawing(id, {
        scene: {
          elements: snapshot.elements as StoredDrawing["scene"]["elements"],
          appState: pickExportAppState(snapshot.appState),
        },
        files: snapshot.files as StoredDrawing["files"],
        thumbnail,
      }, expectedUpdatedAt);
      knownUpdatedAtRef.current = updated.updatedAt;
      setDrawing(updated);
      setStatus({ kind: "saved" });
    } catch (cause) {
      const latest = await getDrawing(id).catch(() => null);
      if (latest && latest.updatedAt > knownUpdatedAtRef.current) {
        applyRemoteDrawing(latest, true);
        return;
      }
      dirtyRef.current = true;
      setStatus({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      savingRef.current = false;
    }
  }, [applyRemoteDrawing, id, setDrawing, setStatus]);

  const scheduleSave = useCallback((
    elements: SceneSnapshot["elements"],
    appState: Record<string, unknown>,
  ): void => {
    const api = apiRef.current;
    if (!api) return;
    latestSceneRef.current = { elements, appState, files: api.getFiles() };
    dirtyRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [apiRef, saveNow]);

  useEffect(() => {
    if (!drawing) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (dirtyRef.current || savingRef.current) return;
      void getDrawing(id).then((latest) => {
        if (cancelled || latest.updatedAt <= knownUpdatedAtRef.current) return;
        applyRemoteDrawing(latest);
      }).catch(() => {});
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyRemoteDrawing, drawing, id]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    void saveNow();
  }, [saveNow]);

  const markLoaded = useCallback((loaded: StoredDrawing): void => {
    knownUpdatedAtRef.current = loaded.updatedAt;
  }, []);

  return { scheduleSave, markLoaded };
}
