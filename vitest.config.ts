import { tmpdir } from "os";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Point the app at the throwaway test database. dotenv never overrides
    // variables that are already set, so this wins over .env.
    // Uploaded test files go to a temp folder, never the project's uploads/.
    env: {
      DB_NAME: "taskflow_test",
      UPLOADS_DIR: path.join(tmpdir(), "taskflow-test-uploads"),
    },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
