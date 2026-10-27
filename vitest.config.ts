import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@": src("./src"),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": src("./tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    silent: "passed-only",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        // Real PostgreSQL: a disposable embedded server, or TEST_DATABASE_URL.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
