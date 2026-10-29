import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Point the app at the throwaway test database. dotenv never overrides
    // variables that are already set, so this wins over .env.
    env: { DB_NAME: "taskflow_test" },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
