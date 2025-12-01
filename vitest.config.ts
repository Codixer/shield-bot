import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", "build", "src/generated"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov", "json-summary"],
      exclude: [
        "node_modules/",
        "build/",
        "src/generated/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.config.ts",
      ],
    },
  },
});

