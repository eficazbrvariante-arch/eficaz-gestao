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
    // Testes de integração (Etapa B da Auditoria Mestra) tocam o banco de
    // verdade e têm config própria — ver `vitest.config.integration.mts` e
    // `npm run test:integration`. Excluídos daqui para o `npm test`/CI
    // continuar 100% unitário, sem depender de `DATABASE_URL`.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
