import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
      // Synthesising the stack bundles both Lambdas with esbuild, which takes a few seconds.
      {
        test: {
          name: "infra",
          include: ["test/infra/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      // Requires DynamoDB Local on http://localhost:8000 (npm run ddb:start).
      { test: { name: "integration", include: ["test/integration/**/*.test.ts"] } },
      // Requires API_URL pointing at a deployed stage; skipped otherwise.
      { test: { name: "e2e", include: ["test/e2e/**/*.test.ts"], testTimeout: 30_000 } },
    ],
  },
});
