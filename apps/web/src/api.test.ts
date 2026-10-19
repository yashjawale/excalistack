import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteDrawing, deleteFolder } from "./api";

describe("delete requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([deleteDrawing, deleteFolder])("does not send a JSON content type for bodyless deletes", async (remove) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await remove("item-id");

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      method: "DELETE",
      headers: new Headers(),
    });
  });
});
