import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose Marko Run plugin builds the app.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
