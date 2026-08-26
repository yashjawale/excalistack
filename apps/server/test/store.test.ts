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
  it("seeds a Drafts folder and places new drawings in it by default", () => {
    const store = makeStore();
    const folders = store.listFolders();

    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe("Drafts");
    expect(folders[0]?.drawingCount).toBe(0);
    expect(store.draftsFolderId()).toBe(folders[0]?.id);

    const drawing = store.create({});
    expect(drawing.folderId).toBe(store.draftsFolderId());
    expect(store.listFolders()[0]?.drawingCount).toBe(1);
  });

  it("creates, renames and deletes folders; delete reassigns drawings to Drafts", () => {
    const store = makeStore();
    const folder = store.createFolder("Architecture");
    const drawing = store.create({ folderId: folder.id });

    const renamed = store.renameFolder(folder.id, "Systems");
    expect(renamed?.name).toBe("Systems");
    expect(store.listFolders().map((f) => f.name)).toEqual(["Drafts", "Systems"]);

    expect(store.deleteFolder(folder.id)).toBe(true);
    expect(store.listFolders().map((f) => f.name)).toEqual(["Drafts"]);
    expect(store.get(drawing.id)?.folderId).toBe(store.draftsFolderId());
  });

  it("creates nested folders with parentId and reports it in listings", () => {
    const store = makeStore();
    const root = store.createFolder("Root");
    const child = store.createFolder("Child", root.id);

    expect(child.parentId).toBe(root.id);
    const listed = store.listFolders().find((f) => f.id === child.id);
    expect(listed?.parentId).toBe(root.id);
    expect(store.listFolders().find((f) => f.id === root.id)?.parentId).toBeNull();
  });

  it("moves folders between parents and refuses to move Drafts", () => {
    const store = makeStore();
    const draftsId = store.draftsFolderId();
    const parentA = store.createFolder("A");
    const parentB = store.createFolder("B");
    const child = store.createFolder("Child", parentA.id);

    const moved = store.moveFolder(child.id, parentB.id);
    expect(moved?.parentId).toBe(parentB.id);

    const toRoot = store.moveFolder(child.id, null);
    expect(toRoot?.parentId).toBeNull();

    expect(() => store.moveFolder(draftsId, parentA.id)).toThrow();
  });

  it("deletes a folder subtree recursively, reassigning all drawings", () => {
    const store = makeStore();
    const root = store.createFolder("Root");
    const child = store.createFolder("Child", root.id);
    const grandchild = store.createFolder("Grandchild", child.id);

    const drawingInChild = store.create({ folderId: child.id, name: "InChild" });
    const drawingInGrandchild = store.create({ folderId: grandchild.id, name: "InGrandchild" });

    expect(store.deleteFolder(root.id)).toBe(true);
    expect(store.listFolders().map((f) => f.name)).toEqual(["Drafts"]);
    expect(store.get(drawingInChild.id)?.folderId).toBe(store.draftsFolderId());
    expect(store.get(drawingInGrandchild.id)?.folderId).toBe(store.draftsFolderId());
  });

  it("refuses to delete the Drafts folder and reports unknown folders", () => {
    const store = makeStore();

    expect(() => store.deleteFolder(store.draftsFolderId())).toThrow();
    expect(store.deleteFolder("missing")).toBe(false);
    expect(store.renameFolder("missing", "x")).toBeNull();
  });

  it("filters listings by folder", () => {
    const store = makeStore();
    const folder = store.createFolder("Work");
    const inFolder = store.create({ folderId: folder.id, name: "Inside" });
    store.create({ name: "Outside" });

    const scoped = store.list(folder.id);
    expect(scoped.map((d) => d.name)).toEqual(["Inside"]);
    expect(scoped[0]?.folderId).toBe(folder.id);
    expect(store.list()).toHaveLength(2);
    expect(inFolder.folderId).toBe(folder.id);
  });

  it("moves drawings between folders without bumping updated_at", async () => {
    const store = makeStore();
    const target = store.createFolder("Target");
    const drawing = store.create({ name: "Mover" });
    const before = drawing.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const moved = store.move(drawing.id, target.id);

    expect(moved?.folderId).toBe(target.id);
    expect(moved?.updatedAt).toBe(before);
    expect(store.list(target.id).map((d) => d.id)).toEqual([drawing.id]);
  });

  it("searches across folders by name and scene content with escaped wildcards", () => {
    const store = makeStore();
    const folder = store.createFolder("Somewhere");
    store.create({
      folderId: folder.id,
      name: "Deploy pipeline",
      scene: {
        elements: [{ id: "t1", type: "text", text: "postgres replication notes" }],
        appState: {},
      },
    });
    store.create({ name: "Groceries" });

    // Name match, global across folders.
    expect(store.list(undefined, "deploy").map((d) => d.name)).toEqual(["Deploy pipeline"]);
    // Content match inside scene elements.
    expect(store.list(undefined, "replication").map((d) => d.name)).toEqual(["Deploy pipeline"]);
    // Case-insensitive.
    expect(store.list(undefined, "POSTGRES")).toHaveLength(1);
    // No match.
    expect(store.list(undefined, "zzz")).toEqual([]);
    // LIKE wildcards are treated literally.
    store.create({ name: "100%_ready" });
    expect(store.list(undefined, "100%")).toHaveLength(1);
    expect(store.list(undefined, "0%_r")).toHaveLength(1);
    expect(store.list(undefined, "%_")).toHaveLength(1);
  });

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
