import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
  resolve: {
    // Strip the .js extension that NodeNext adds so vitest finds the .ts source
    alias: [{ find: /^(.+)\.js$/, replacement: "$1" }],
  },
});
