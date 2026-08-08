import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mesmo alias de `tsconfig.json` (`"@/*": ["./src/*"]") — o TypeScript só
    // resolve isso para o typecheck; o Vitest precisa da própria config.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
