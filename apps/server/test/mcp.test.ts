import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { IN_MEMORY_DB, openDatabase } from "../src/db.js";
import { SqliteDrawingStore } from "../src/store.js";
import { SqliteCheckpointStore } from "../src/mcp/checkpointStore.js";
import { registerTools } from "../src/mcp/vendor/excalidraw-server.js";
import { registerExcalistackTools } from "../src/mcp/tools.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const vendorDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/mcp/vendor");

/**
 * Creates a paired client/server with both official and excalistack
 * tools registered. Returns a connected client ready for tool calls.
 */
async function createConnectedClient(db: ReturnType<typeof openDatabase>) {
  const drawingStore = new SqliteDrawingStore(db);
  const checkpointStore = new SqliteCheckpointStore(db);

  const server = new McpServer({ name: "Excalistack-Test", version: "1.0.0" });
  await registerTools(server, vendorDist, checkpointStore);
  registerExcalistackTools(server, drawingStore);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client, drawingStore, checkpointStore, server };
}

describe("MCP integration", () => {
  it("exposes both official and excalistack tools via tools/list", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const { client } = await createConnectedClient(db);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain("read_me");
    expect(names).toContain("create_view");
    expect(names).toContain("list_drawings");
    expect(names).toContain("search_drawings");
    expect(names).toContain("get_drawing");
    expect(names).toContain("save_drawing");
    expect(names).toContain("delete_drawing");
    expect(names).toContain("list_folders");
    expect(names).toContain("create_folder");
    expect(names).toContain("update_folder");
    expect(names).toContain("delete_folder");
  });

  it("supports folder creation, rename, move, and deletion through MCP", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const { client } = await createConnectedClient(db);
    const created = await client.callTool({
      name: "create_folder",
      arguments: { name: "Projects" },
    });
    expect(created.isError).toBeFalsy();
    const folder = (created.structuredContent as { folder: { id: string } }).folder;
    const updated = await client.callTool({
      name: "update_folder",
      arguments: { id: folder.id, name: "Archive" },
    });
    expect(updated.isError).toBeFalsy();
    expect((updated.structuredContent as { folder: { name: string } }).folder.name).toBe("Archive");
    const deleted = await client.callTool({ name: "delete_folder", arguments: { id: folder.id } });
    expect(deleted.isError).toBeFalsy();
    expect(
      (await client.callTool({ name: "list_folders", arguments: {} })).content?.[0],
    ).toMatchObject({
      text: expect.not.stringContaining("Archive"),
    });
  });

  it("round-trips save_drawing → get_drawing → search → delete", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const { client } = await createConnectedClient(db);

    const elements = JSON.stringify([
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 50 },
    ]);

    const saved = await client.callTool({
      name: "save_drawing",
      arguments: { name: "MCP Test", elements },
    });
    expect(saved.isError).toBeFalsy();
    const savedText = (saved.content as { text: string }[])[0]!.text;
    const idMatch = savedText.match(/\(([A-Za-z0-9_-]+)\)/);
    const id = idMatch?.[1];
    expect(id).toBeTruthy();

    const fetched = await client.callTool({ name: "get_drawing", arguments: { id } });
    expect(fetched.isError).toBeFalsy();
    expect((fetched.structuredContent as { name: string }).name).toBe("MCP Test");

    const listed = await client.callTool({ name: "list_drawings", arguments: {} });
    expect((listed.content as { text: string }[])[0]!.text).toContain("MCP Test");

    const searched = await client.callTool({
      name: "search_drawings",
      arguments: { q: "MCP Test" },
    });
    expect((searched.content as { text: string }[])[0]!.text).toContain("MCP Test");

    const folders = await client.callTool({ name: "list_folders", arguments: {} });
    expect((folders.content as { text: string }[])[0]!.text).toContain("Drafts");

    const deleted = await client.callTool({ name: "delete_drawing", arguments: { id } });
    expect(deleted.isError).toBeFalsy();

    const afterDelete = await client.callTool({ name: "get_drawing", arguments: { id } });
    expect(afterDelete.isError).toBe(true);
  });

  it("create_view stores a checkpoint retrievable via the SQLite store", async () => {
    const db = openDatabase(IN_MEMORY_DB);
    const { client, checkpointStore } = await createConnectedClient(db);

    const elements = JSON.stringify([
      { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
      { type: "rectangle", id: "r1", x: 100, y: 100, width: 200, height: 80 },
    ]);

    const result = await client.callTool({ name: "create_view", arguments: { elements } });
    expect(result.isError).toBeFalsy();
    const text = (result.content as { text: string }[])[0]!.text;
    const match = text.match(/Checkpoint id: "([^"]+)"/);
    const checkpointId = match?.[1];
    expect(checkpointId).toBeTruthy();

    const loaded = await checkpointStore.load(checkpointId!);
    expect(loaded).not.toBeNull();
    expect(loaded!.elements).toHaveLength(2);
  });
});
