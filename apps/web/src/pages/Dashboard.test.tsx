import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Dashboard } from "./Dashboard";

const api = vi.hoisted(() => ({
  createDrawing: vi.fn(),
  createFolder: vi.fn(),
  deleteDrawing: vi.fn(),
  deleteFolder: vi.fn(),
  importDrawingFile: vi.fn(),
  listDrawings: vi.fn(),
  listFolders: vi.fn(),
  moveFolder: vi.fn(),
  renameOrMoveDrawing: vi.fn(),
  renameFolder: vi.fn(),
  getDrawing: vi.fn(),
  updateDrawing: vi.fn(),
  getMcpStatus: vi.fn(),
}));

vi.mock("../api", () => api);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe("Dashboard actions", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    api.listFolders.mockResolvedValue({
      folders: [{ id: "draft-id", name: "Drafts", parentId: null, drawingCount: 0, createdAt: 1 }],
    });
    api.listDrawings.mockResolvedValue({ drawings: [] });
    api.createDrawing.mockResolvedValue({ id: "new-drawing" });
    api.getMcpStatus.mockResolvedValue(null);
  });

  it("creates a drawing in the active folder and opens it", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
        <LocationProbe />
      </MemoryRouter>,
    );

    const createButton = await screen.findByRole("button", { name: "New drawing" });
    await waitFor(() => expect(createButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(api.createDrawing).toHaveBeenCalledWith({ folderId: "draft-id" });
      expect(screen.getByTestId("location").textContent).toBe("/d/new-drawing");
    });
  });
});
