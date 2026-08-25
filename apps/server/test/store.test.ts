import type { CreateDrawingInput } from "@excalistack/shared";
import { describe, expect, it } from "vitest";
import { IN_MEMORY_DB, openDatabase } from "../src/db.js";
import { SqliteDrawingStore } from "../src/store.js";

/**
 * Creates a store backed by a fresh in-memory database.
 *
 * @returns Isolated drawing store instance.
 */
function makeStore(): SqliteDrawingStore {
  return new SqliteDrawingStore(openDatabase(IN_MEMORY_DB));
}

/** A minimal valid element factory for concise test scenes. */
const rect = (id: string) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10 });

describe("SqliteDrawingStore", () => {
  it("creates an empty drawing with server-side defaults", () => {
    const store = makeStore();
    const drawing = store.create({});

    expect(drawing.name).toBe("Untitled drawing");
    expect(drawing.scene.elements).toEqual([]);
    expect(drawing.scene.appState).toEqual({});
    expect(drawing.files).toEqual({});
    expect(drawing.thumbnail).toBeNull();
    expect(drawing.elementCount).toBe(0);
  });

  it("persists and round-trips scene content and files", () => {
    const store = makeStore();
    const input: CreateDrawingInput = {
      name: "Architecture",
      scene: {
        elements: [rect("a"), { ...rect("b"), isDeleted: true }],
        appState: { viewBackgroundColor: "#ffffff" },
      },
      files: { "f1": { mimeType: "image/png", dataURL: "data:image/png;base64,AAA" } },
      thumbnail: "data:image/png;base64,thumb",
    };

    const created = store.create(input);
    const loaded = store.get(created.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("Architecture");
    expect(loaded?.scene.elements).toHaveLength(2);
    expect(loaded?.scene.appState).toEqual({ viewBackgroundColor: "#ffffff" });
    expect(loaded?.files["f1"]?.dataURL).toBe("data:image/png;base64,AAA");
    // Deleted elements are stored but not counted.
    expect(created.elementCount).toBe(1);
  });

  it("returns null for unknown ids on every read path", () => {
    const store = makeStore();

    expect(store.get("missing")).toBeNull();
    expect(store.update("missing", { name: undefined })).toBeNull();
    expect(store.rename("missing", "x")).toBeNull();
    expect(store.delete("missing")).toBe(false);
  });

  it("updates provided fields only and recomputes element count", async () => {
    const store = makeStore();
    const created = store.create({ name: "Draft", scene: { elements: [rect("a")], appState: {} } });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = store.update(created.id, {
      scene: { elements: [rect("a"), rect("b")], appState: { gridSize: 20 } },
      thumbnail: null,
    });

    expect(updated?.elementCount).toBe(2);
    expect(updated?.name).toBe("Draft");
    expect(updated?.thumbnail).toBeNull();
    expect(updated?.scene.appState).toEqual({ gridSize: 20 });
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it("renames without altering scene or timestamps of content", () => {
    const store = makeStore();
    const created = store.create({ name: "Before" });

    const renamed = store.rename(created.id, "After");

    expect(renamed?.name).toBe("After");
    expect(store.get(created.id)?.scene.elements).toEqual([]);
  });

  it("lists drawings most recently updated first", async () => {
    const store = makeStore();
    const first = store.create({ name: "First" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = store.create({ name: "Second" });

    const list = store.list();

    expect(list.map((d) => d.name)).toEqual(["Second", "First"]);
    expect(list[0]?.id).toBe(second.id);
    expect(list[1]?.id).toBe(first.id);

    await new Promise((resolve) => setTimeout(resolve, 5));
    store.rename(first.id, "First!");
    expect(store.list().map((d) => d.name)).toEqual(["First!", "Second"]);
  });

  it("deletes drawings permanently", () => {
    const store = makeStore();
    const created = store.create({ name: "Doomed" });

    expect(store.delete(created.id)).toBe(true);
    expect(store.get(created.id)).toBeNull();
    expect(store.list()).toEqual([]);
  });
});
