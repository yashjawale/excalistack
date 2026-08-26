import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IN_MEMORY_DB, openDatabase } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { SqliteDrawingStore } from "../src/store.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Boots the application against an in-memory store.
 *
 * @param webDistDir - Optional SPA directory to serve statically.
 * @returns The configured Fastify application.
 */
async function makeApp(webDistDir?: string) {
  const store = new SqliteDrawingStore(openDatabase(IN_MEMORY_DB));
  return buildApp({ store, webDistDir });
}

describe("API", () => {
  it("reports health", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("rejects invalid create bodies with HTTP 400", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/drawings",
      payload: { name: 42 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/invalid/i);
  });

  it("accepts raw .excalidraw documents as create bodies (scripted import)", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/drawings",
      payload: {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements: [{ id: "r1", type: "rectangle", x: 0, y: 0 }],
        appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 1 },
        files: {},
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.scene.elements).toHaveLength(1);
    // Non-export app state keys are stripped on import.
    expect(body.scene.appState).toEqual({ viewBackgroundColor: "#ffffff" });
  });

  it("creates, lists, updates, renames, exports, deletes", async () => {
    const app = await makeApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/drawings",
      payload: {
        name: "Flow",
        scene: {
          elements: [{ id: "e1", type: "rectangle", x: 0, y: 0 }],
          appState: { viewBackgroundColor: "#fafafa" },
        },
        files: { f1: { mimeType: "image/png", dataURL: "data:image/png;base64,x" } },
      },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    // Create responds with the full drawing so importers can use it directly.
    expect(createdBody).toMatchObject({ name: "Flow", elementCount: 1 });
    expect(createdBody.id).toBeTruthy();
    expect(createdBody.scene.elements).toHaveLength(1);

    const list = await app.inject({ method: "GET", url: "/api/drawings" });
    expect(list.json().drawings).toHaveLength(1);
    // Listings carry no scene payload.
    expect(list.json().drawings[0].scene).toBeUndefined();

    const updated = await app.inject({
      method: "PUT",
      url: `/api/drawings/${createdBody.id}`,
      payload: { scene: { elements: [], appState: {} }, thumbnail: null },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ elementCount: 0, name: "Flow" });

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/drawings/${createdBody.id}`,
      payload: { name: "Renamed flow" },
    });
    expect(renamed.json().name).toBe("Renamed flow");

    const exported = await app.inject({
      method: "GET",
      url: `/api/drawings/${createdBody.id}/export`,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain('filename="Renamed-flow.excalidraw"');
    const doc = exported.json();
    expect(doc).toMatchObject({ type: "excalidraw", version: 2, elements: [] });

    const deleted = await app.inject({ method: "DELETE", url: `/api/drawings/${createdBody.id}` });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/drawings/${createdBody.id}` })).statusCode).toBe(404);
  });

  it("answers 404 with JSON for unknown drawing ids", async () => {
    const app = await makeApp();
    const urls = [
      { method: "GET", url: "/api/drawings/nope" },
      { method: "PUT", url: "/api/drawings/nope", payload: {} },
      { method: "PATCH", url: "/api/drawings/nope", payload: { name: "x" } },
      { method: "DELETE", url: "/api/drawings/nope" },
      { method: "GET", url: "/api/drawings/nope/export" },
    ];
    for (const req of urls) {
      const res = await app.inject(req);
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("Folders API", () => {
  it("creates, lists, renames and deletes folders", async () => {
    const app = await makeApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { name: "Architecture" },
    });
    expect(created.statusCode).toBe(201);
    const folder = created.json();
    expect(folder).toMatchObject({ name: "Architecture", drawingCount: 0 });

    const listed = await app.inject({ method: "GET", url: "/api/folders" });
    const names = listed.json().folders.map((f: { name: string }) => f.name);
    expect(names).toEqual(["Drafts", "Architecture"]);

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/folders/${folder.id}`,
      payload: { name: "Systems" },
    });
    expect(renamed.json().name).toBe("Systems");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/folders/${folder.id}`,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it("rejects duplicate folder names case-insensitively with 409", async () => {
    const app = await makeApp();
    await app.inject({ method: "POST", url: "/api/folders", payload: { name: "Work" } });

    const dup = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { name: "work" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("protects the Drafts folder from deletion with 409", async () => {
    const app = await makeApp();
    const folders = (await app.inject({ method: "GET", url: "/api/folders" })).json().folders;
    const drafts = folders.find((f: { name: string }) => f.name === "Drafts");

    const res = await app.inject({ method: "DELETE", url: `/api/folders/${drafts.id}` });
    expect(res.statusCode).toBe(409);
  });

  it("scopes drawing listings by folder and moves drawings via PATCH", async () => {
    const app = await makeApp();
    const folder = (
      await app.inject({ method: "POST", url: "/api/folders", payload: { name: "Move target" } })
    ).json();
    const drawing = (
      await app.inject({
        method: "POST",
        url: "/api/drawings",
        payload: { name: "Wanderer" },
      })
    ).json();

    const scoped = await app.inject({
      method: "GET",
      url: `/api/drawings?folderId=${folder.id}`,
    });
    expect(scoped.json().drawings).toEqual([]);

    const moved = await app.inject({
      method: "PATCH",
      url: `/api/drawings/${drawing.id}`,
      payload: { folderId: folder.id },
    });
    expect(moved.json().folderId).toBe(folder.id);

    const after = await app.inject({
      method: "GET",
      url: `/api/drawings?folderId=${folder.id}`,
    });
    expect(after.json().drawings).toHaveLength(1);

    const badFolder = await app.inject({
      method: "PATCH",
      url: `/api/drawings/${drawing.id}`,
      payload: { folderId: "nope" },
    });
    expect(badFolder.statusCode).toBe(400);
  });

  it("creates drawings into a given folder and rejects unknown folders", async () => {
    const app = await makeApp();
    const folder = (
      await app.inject({ method: "POST", url: "/api/folders", payload: { name: "Inbox" } })
    ).json();

    const created = await app.inject({
      method: "POST",
      url: "/api/drawings",
      payload: { name: "Placed", folderId: folder.id },
    });
    expect(created.json().folderId).toBe(folder.id);

    const bad = await app.inject({
      method: "POST",
      url: "/api/drawings",
      payload: { folderId: "nope" },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe("Static hosting", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "excalistack-web-"));

  beforeAll(() => {
    writeFileSync(path.join(dir, "index.html"), "<html><body>spa</body></html>");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves the SPA root and history-fallback routes", async () => {
    const app = await makeApp(dir);

    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain("spa");

    const deep = await app.inject({ method: "GET", url: "/d/abc123" });
    expect(deep.statusCode).toBe(200);
    expect(deep.body).toContain("spa");
  });

  it("keeps API 404s as JSON even when hosting the SPA", async () => {
    const app = await makeApp(dir);
    const res = await app.inject({ method: "GET", url: "/api/does-not-exist" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: "Not found" });
  });
});
