import { exportToBlob } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { StoredDrawing } from "@excalistack/shared";
import { normalizeSceneElements } from "./normalizeSceneElements";

const THUMBNAIL_WIDTH = 320;

/** Render a stored scene to a small PNG without mounting the editor. */
export async function generateThumbnail(drawing: StoredDrawing): Promise<string | null> {
  const elements = normalizeSceneElements(drawing.scene.elements)
    .filter((element) => !(element as { isDeleted?: boolean }).isDeleted);
  if (elements.length === 0) return null;

  const blob = await exportToBlob({
    elements: elements as never,
    appState: {
      theme: "light",
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: "#ffffff",
    } as Partial<AppState>,
    files: drawing.files as never,
    mimeType: "image/png",
    exportPadding: 8,
    getDimensions: (width: number, height: number) => ({
      width: THUMBNAIL_WIDTH,
      height: Math.max(1, Math.round((height / width) * THUMBNAIL_WIDTH)),
      scale: THUMBNAIL_WIDTH / width,
    }),
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read thumbnail"));
    reader.readAsDataURL(blob);
  });
}
