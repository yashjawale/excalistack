import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

/**
 * Converts compact MCP diagram elements into Excalidraw-native elements.
 *
 * MCP diagrams can use `label` on shapes and arrows, whereas Excalidraw
 * stores those labels as separate bound text elements. `restore()` does not
 * perform that conversion, so normalize scenes before restoring or exporting.
 */
export function normalizeSceneElements(elements: readonly unknown[]): unknown[] {
  const drawable = elements.filter((element) => {
    return typeof element === "object" && element !== null && "type" in element
      && (element as { type: string }).type !== "cameraUpdate";
  });

  const hasCompactLabels = drawable.some((element) =>
    typeof element === "object" && element !== null && "label" in element,
  );

  if (!hasCompactLabels) return drawable;

  return convertToExcalidrawElements(drawable as never) as unknown[];
}
