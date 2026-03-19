import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      TURSO_DATABASE_URL: "file:./data/test.db",
      TURSO_AUTH_TOKEN: "",
      ETHERSCAN_API_KEY: "test-key",
    },
  },
});
