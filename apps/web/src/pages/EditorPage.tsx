import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { Excalidraw, restore } from "@excalidraw/excalidraw";
// Component styles for the canvas; loaded only on editor pages so the
// dashboard does not pull in the excalidraw stylesheet.
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { ExcalidrawDocumentSchema } from "@excalistack/shared";
import type { StoredDrawing } from "@excalistack/shared";
import { getDrawing, renameOrMoveDrawing } from "../api";
import { InlineRename } from "../components/InlineRename";
import { McpIndicator } from "../components/McpIndicator";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useTheme } from "../hooks/useTheme";
import { normalizeSceneElements } from "../normalizeSceneElements";
import { useEditorAutosave } from "../hooks/useEditorAutosave";

/** Lifecycle state of the current drawing session. */
type EditorStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

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

  // MCP-created scenes can contain minimal but valid elements. Normalize them
  // through Excalidraw's restore path before initial render, just as we do for
  // scenes pulled into an already-open editor.
  const initialData = useMemo(() => {
    if (!drawing) return null;
    const restored = restore(
      {
        type: "excalidraw",
        version: 2,
        source: "https://github.com/yash/excalistack",
        elements: normalizeSceneElements(drawing.scene.elements),
        appState: { ...drawing.scene.appState, viewBackgroundColor: "#ffffff" },
        files: drawing.files,
      } as never,
      null,
      null,
    );
    return {
      elements: restored.elements,
      appState: {
        ...restored.appState,
        theme,
        viewBackgroundColor: "#ffffff",
      },
      files: restored.files,
    };
  }, [drawing, theme]);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const externalSceneUpdateRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scheduleSave, markLoaded } = useEditorAutosave({
    id,
    theme,
    drawing,
    setDrawing,
    setStatus,
    setFlash,
    apiRef,
    externalSceneUpdateRef,
  });

  // Excalidraw initializes from `theme` but does not always apply subsequent
  // prop changes to its live app state. Keep the mounted canvas in sync with
  // the shared theme switcher as well.
  useEffect(() => {
    apiRef.current?.updateScene({ appState: { theme } as never });
  }, [theme]);

  // Load the drawing once.
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    getDrawing(id)
      .then((loaded) => {
        if (!cancelled) {
          markLoaded(loaded);
          setDrawing(loaded);
        }
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
  }, [id, markLoaded]);

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
          const restored = restore(
            {
              ...parsed.data,
              elements: normalizeSceneElements(parsed.data.elements),
            } as never,
            null,
            null,
          );
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
        <Link
          className="editor-back-button"
          to="/"
          aria-label="Back to all drawings"
          title="Back to all drawings"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
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
          <span className="editor-title">{status.kind === "loading" ? "Loading…" : "…"}</span>
        )}
        <div className="editor-right-controls">
          {(status.kind === "saving" || status.kind === "saved") && (
            <span
              className="status status-ok"
              title={status.kind === "saving" ? "Saving changes…" : "All changes saved"}
              aria-label={status.kind === "saving" ? "Saving changes" : "All changes saved"}
            >
              <span className="save-status-dot" aria-hidden="true" />
            </span>
          )}
          {status.kind === "error" && (
            <span className="status status-error" title={status.message}>
              {drawing ? "Save failed" : "Load failed"}
            </span>
          )}
          <ThemeSwitcher />
          <McpIndicator />
        </div>
      </header>

      {drawing && (
        <div className="editor-container" ref={containerRef}>
          <Excalidraw
            theme={theme}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={initialData!}
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
