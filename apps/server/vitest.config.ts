import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the excalistack server test suite.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
