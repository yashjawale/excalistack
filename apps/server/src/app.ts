import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyLoggerOptions } from "fastify";
import fastify from "fastify";
import { ZodError } from "zod";
import { registerDrawingRoutes } from "./routes/drawings.js";
import type { DrawingStore } from "./store.js";

/** Options accepted by {@link buildApp}. */
export interface BuildAppOptions {
  /** Drawing persistence backend used by all routes. */
  store: DrawingStore;
  /**
   * Directory of the built web SPA to serve at `/`. Omitted or `null`
   * serves API only.
   */
  webDistDir?: string | null;
  /** Passed through to the Fastify logger setting (default off). */
  logger?: boolean | FastifyLoggerOptions;
}

/**
 * Builds the excalistack HTTP application: JSON API under `/api`,
 * optional static hosting of the SPA at `/`, zod-aware error mapping,
 * and SPA history fallback for client-side routes.
 *
 * The returned instance is not yet listening; call `.listen()` on it.
 *
 * @param options - Application wiring options.
 * @returns Configured Fastify application instance.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { store, logger = false } = options;
  // Generous body limit: drawings embed images as base64 data URLs.
  const app = fastify({ logger, bodyLimit: 64 * 1024 * 1024 });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message ?? "Invalid request body";
      return reply.code(400).send({ message: `Invalid request: ${detail}` });
    }
    const validationError = error as { validation?: unknown };
    if (validationError.validation) {
      return reply.code(400).send({ message: "Invalid request" });
    }
    app.log.error(error);
    return reply.code(500).send({ message: "Internal server error" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  await registerDrawingRoutes(app, store);

  const webDistDir = options.webDistDir ?? null;
  if (webDistDir) {
    await app.register(fastifyStatic, { root: path.resolve(webDistDir) });
  }

  app.setNotFoundHandler((request, reply) => {
    // History-API fallback: serve the SPA shell for non-API GET navigations.
    if (webDistDir && request.method === "GET" && !request.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ message: "Not found" });
  });

  return app;
}
