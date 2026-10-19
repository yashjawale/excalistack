import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteDrawing, deleteFolder, listDrawings, listFolders } from "./api";

describe("delete requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([deleteDrawing, deleteFolder])(
    "does not send a JSON content type for bodyless deletes",
    async (remove) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      await remove("item-id");

      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
        method: "DELETE",
        headers: new Headers(),
      });
    },
  );
});

describe("read requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([listDrawings, listFolders])(
    "does not set a JSON content type without a body",
    async (list) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ drawings: [], folders: [] }), { status: 200 }),
        );
      vi.stubGlobal("fetch", fetchMock);

      await list();

      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
        headers: new Headers(),
      });
    },
  );
});
