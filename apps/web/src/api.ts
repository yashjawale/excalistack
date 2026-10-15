import { ExcalidrawDocumentSchema, pickExportAppState } from "@excalistack/shared";
import type {
  CreateDrawingInput,
  DrawingSummary,
  FolderSummary,
  StoredDrawing,
  UpdateDrawingInput,
} from "@excalistack/shared";

/**
 * Performs a JSON request against the API, mapping non-2xx responses to
 * thrown errors carrying the server-provided message.
 *
 * @typeParam T - Expected response body type.
 * @param url - Absolute API path, e.g. `/api/drawings`.
 * @param init - Optional fetch options; JSON content type is pre-set.
 * @returns Parsed response body (`undefined` for 204 responses).
 */
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * Lists all folders with their drawing counts, oldest first.
 */
export function listFolders(): Promise<{ folders: FolderSummary[] }> {
  return request("/api/folders");
}

/** MCP endpoint availability and recent request activity. */
export interface McpStatus {
  enabled: boolean;
  activeRequests: number;
  lastRequestAt: number | null;
}

/** Reads MCP server status; returns null when MCP is disabled. */
export async function getMcpStatus(): Promise<McpStatus | null> {
  try {
    return await request<McpStatus>("/api/mcp/status");
  } catch {
    return null;
  }
}

/**
 * Creates a folder, optionally nested under a parent.
 *
 * @param name - Folder display name.
 * @param parentId - Parent folder identifier; omitted = root level.
 */
export function createFolder(name: string, parentId?: string): Promise<FolderSummary> {
  return request("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
}

/**
 * Renames a folder.
 *
 * @param id - Folder identifier.
 * @param name - New display name.
 */
export function renameFolder(id: string, name: string): Promise<FolderSummary> {
  return request(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

/**
 * Re-parents a folder.
 *
 * @param id - Folder identifier.
 * @param parentId - New parent folder identifier, or `null` for root.
 */
export function moveFolder(id: string, parentId: string | null): Promise<FolderSummary> {
  return request(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ parentId }),
  });
}

/**
 * Deletes a folder; its drawings move to the Drafts folder.
 *
 * @param id - Folder identifier.
 */
export async function deleteFolder(id: string): Promise<void> {
  await request<void>(`/api/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Lists drawings, optionally scoped to a folder or matched against a
 * global search query, most recently updated first.
 *
 * @param folderId - Folder to scope the listing to.
 * @param q - Search term matched against names and scene content;
 * takes precedence over `folderId`.
 */
export function listDrawings(
  folderId?: string,
  q?: string,
): Promise<{ drawings: DrawingSummary[]; query?: string }> {
  const params = new URLSearchParams();
  if (folderId) params.set("folderId", folderId);
  if (q?.trim()) params.set("q", q.trim());
  const query = params.toString();
  return request(`/api/drawings${query ? `?${query}` : ""}`);
}

/**
 * Fetches one drawing including its full scene and files.
 *
 * @param id - Drawing identifier.
 */
export function getDrawing(id: string): Promise<StoredDrawing> {
  return request(`/api/drawings/${encodeURIComponent(id)}`);
}

/**
 * Creates a new drawing, optionally seeded with scene content.
 *
 * @param input - Initial name, scene, files and/or thumbnail.
 */
export function createDrawing(input: CreateDrawingInput): Promise<StoredDrawing> {
  return request("/api/drawings", { method: "POST", body: JSON.stringify(input) });
}

/**
 * Saves parts of a drawing (editor autosave entry point).
 *
 * @param id - Drawing identifier.
 * @param input - Scene/files/thumbnail replacements.
 */
export function updateDrawing(
  id: string,
  input: UpdateDrawingInput,
  expectedUpdatedAt?: number,
): Promise<StoredDrawing> {
  return request(`/api/drawings/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: expectedUpdatedAt === undefined ? undefined : { "if-unmodified-since": String(expectedUpdatedAt) },
    body: JSON.stringify(input),
  });
}

/**
 * Renames and/or moves a drawing.
 *
 * @param id - Drawing identifier.
 * @param input - New name and/or target folder.
 */
export function renameOrMoveDrawing(
  id: string,
  input: { name?: string; folderId?: string },
): Promise<DrawingSummary> {
  return request(`/api/drawings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Permanently deletes a drawing.
 *
 * @param id - Drawing identifier.
 */
export async function deleteDrawing(id: string): Promise<void> {
  await request<void>(`/api/drawings/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Imports a `.excalidraw` file chosen by the user and stores it as a new
 * drawing. The file is parsed and validated client-side so failures
 * surface before any network traffic.
 *
 * @param file - File object from an `<input type="file">` or drop event.
 * @param folderId - Folder to place the imported drawing in.
 * @returns The freshly created drawing.
 * @throws Error when the file is not valid JSON or not a valid
 * `.excalidraw` document.
 */
export async function importDrawingFile(file: File, folderId?: string): Promise<StoredDrawing> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`"${file.name}" is not valid JSON`);
  }

  const result = ExcalidrawDocumentSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`"${file.name}" is not a valid .excalidraw document`);
  }
  const document = result.data;

  return createDrawing({
    name: file.name.replace(/\.(excalidraw|json|excalidrawplus)$/i, "") || file.name,
    folderId,
    scene: {
      elements: document.elements,
      appState: pickExportAppState(document.appState),
    },
    files: document.files,
  });
}
