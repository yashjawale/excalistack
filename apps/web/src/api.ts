import { ExcalidrawDocumentSchema, pickExportAppState } from "@excalistack/shared";
import type {
  CreateDrawingInput,
  DrawingSummary,
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
    headers: { "content-type": "application/json" },
    ...init,
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
 * Lists all stored drawings, most recently updated first.
 *
 * @returns Drawing summaries without scene payloads.
 */
export function listDrawings(): Promise<{ drawings: DrawingSummary[] }> {
  return request("/api/drawings");
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
): Promise<StoredDrawing> {
  return request(`/api/drawings/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * Renames a drawing.
 *
 * @param id - Drawing identifier.
 * @param name - New display name.
 */
export function renameDrawing(id: string, name: string): Promise<DrawingSummary> {
  return request(`/api/drawings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
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
 * @returns The freshly created drawing.
 * @throws Error when the file is not valid JSON or not a valid
 * `.excalidraw` document.
 */
export async function importDrawingFile(file: File): Promise<StoredDrawing> {
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
    scene: {
      elements: document.elements,
      appState: pickExportAppState(document.appState),
    },
    files: document.files,
  });
}
