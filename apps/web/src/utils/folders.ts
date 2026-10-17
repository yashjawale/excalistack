import type { FolderSummary } from "@excalistack/shared";

/** Groups a flat folder list by parent while preserving sibling order. */
export function buildChildrenMap(folders: FolderSummary[]): Map<string | null, FolderSummary[]> {
  const map = new Map<string | null, FolderSummary[]>();
  for (const folder of folders) {
    const siblings = map.get(folder.parentId) ?? [];
    siblings.push(folder);
    map.set(folder.parentId, siblings);
  }
  return map;
}

/** Returns whether a folder can be moved under the proposed target. */
export function canMoveFolderInto(
  folders: FolderSummary[],
  sourceId: string,
  targetId: string,
): boolean {
  const source = folders.find((folder) => folder.id === sourceId);
  const target = folders.find((folder) => folder.id === targetId);
  if (
    !source ||
    !target ||
    source.id === target.id ||
    target.name === "Drafts" ||
    source.name === "Drafts"
  ) {
    return false;
  }
  let ancestorId = target.parentId;
  while (ancestorId) {
    if (ancestorId === source.id) return false;
    ancestorId = folders.find((folder) => folder.id === ancestorId)?.parentId ?? null;
  }
  return true;
}
