import { describe, expect, it } from "vitest";
import { IN_MEMORY_DB, openDatabase } from "../src/db.js";
import { SqliteCheckpointStore } from "../src/mcp/checkpointStore.js";

describe("SqliteCheckpointStore", () => {
  it("round-trips save and load", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const store = new SqliteCheckpointStore(db);
    await store.save("abc123", { elements: [{ id: "a", type: "rectangle" }] });

    const loaded = await store.load("abc123");
    expect(loaded).toEqual({ elements: [{ id: "a", type: "rectangle" }] });
  });

  it("returns null for unknown ids", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const store = new SqliteCheckpointStore(db);
    expect(await store.load("missing")).toBeNull();
  });

  it("rejects invalid checkpoint ids", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const store = new SqliteCheckpointStore(db);
    await expect(store.save("../escape", { elements: [] })).rejects.toThrow();
    await expect(store.load("../escape")).rejects.toThrow();
  });

  it("prunes oldest entries when exceeding 100", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const store = new SqliteCheckpointStore(db);
    for (let i = 0; i < 101; i += 1) {
      await store.save(`id_${i}`, { elements: [{ id: `${i}` }] });
    }
    expect(await store.load("id_0")).toBeNull();
    expect(await store.load("id_100")).not.toBeNull();
  });

  it("persists across store instances backed by the same db file", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const storeA = new SqliteCheckpointStore(db);
    await storeA.save("shared", { elements: [{ id: "x" }] });

    const storeB = new SqliteCheckpointStore(db);
    expect(await storeB.load("shared")).toEqual({ elements: [{ id: "x" }] });
  });
});
