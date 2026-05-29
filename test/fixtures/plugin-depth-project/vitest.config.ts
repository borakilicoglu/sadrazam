import { defineConfig } from "vitest/config";
import "@vitest/coverage-istanbul";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
    },
  },
});
