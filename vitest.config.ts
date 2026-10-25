import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "specs/**"],
    globals: false,
    setupFiles: ["./test/logging.ts"],
    coverage: { provider: "v8" },
  },
});
