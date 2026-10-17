import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredDrawing } from "@excalistack/shared";
import { useEditorAutosave } from "./useEditorAutosave";

vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: vi.fn(),
  restore: vi.fn(() => ({ elements: [], appState: {}, files: {} })),
}));

const api = vi.hoisted(() => ({ getDrawing: vi.fn(), updateDrawing: vi.fn() }));
vi.mock("../api", () => api);

const drawing: StoredDrawing = {
  id: "drawing-1",
  name: "Test drawing",
  folderId: "drafts",
  scene: { elements: [], appState: {} },
  files: {},
  thumbnail: null,
  elementCount: 0,
  createdAt: 1,
  updatedAt: 10,
};

function makeOptions() {
  return {
    id: drawing.id,
    theme: "light" as const,
    drawing,
    setDrawing: vi.fn(),
    setStatus: vi.fn(),
    setFlash: vi.fn(),
    apiRef: {
      current: {
        getFiles: () => ({}),
        updateScene: vi.fn(),
        addFiles: vi.fn(),
        scrollToContent: vi.fn(),
      },
    } as never,
    externalSceneUpdateRef: { current: false },
  };
}

describe("useEditorAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it("persists the latest local scene after the debounce", async () => {
    const options = makeOptions();
    const updated = { ...drawing, updatedAt: 11 };
    api.getDrawing.mockResolvedValue(drawing);
    api.updateDrawing.mockResolvedValue(updated);
    const { result, unmount } = renderHook(() => useEditorAutosave(options));
    act(() => {
      result.current.markLoaded(drawing);
      result.current.scheduleSave([], {});
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(api.updateDrawing).toHaveBeenCalledWith(
      drawing.id,
      { scene: { elements: [], appState: {} }, files: {}, thumbnail: null },
      drawing.updatedAt,
    );
    expect(options.setDrawing).toHaveBeenCalledWith(updated);
    unmount();
  });

  it("keeps a newer remote scene when a local save conflicts", async () => {
    const options = makeOptions();
    const remote = { ...drawing, updatedAt: 12 };
    api.getDrawing.mockResolvedValue(remote);
    const { result, unmount } = renderHook(() => useEditorAutosave(options));
    act(() => result.current.markLoaded(drawing));

    act(() => result.current.scheduleSave([], {}));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(options.setDrawing).toHaveBeenCalledWith(remote);
    expect(options.setFlash).toHaveBeenCalledWith("Updated from MCP; unsaved local edits were replaced.");
    expect(api.updateDrawing).not.toHaveBeenCalled();
    unmount();
  });
});
