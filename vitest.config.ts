import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately narrow scope: this project has no test suite at all yet
// (see README's "worth flagging" section) — this config exists to start
// covering the highest-risk pure logic (tenant/permission checks, LMS
// completion math), not to become a full app test harness. Route handlers
// and anything touching Prisma at import time aren't covered here; that
// needs a real or mocked database connection this config doesn't set up.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
