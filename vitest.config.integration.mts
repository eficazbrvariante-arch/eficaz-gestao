import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config separada para os testes de INTEGRAÇÃO da Etapa B da Auditoria Mestra
// (`docs/testes-multitenant.md`) — esses testes conectam de verdade no banco
// `dev-local` (Neon), diferente da suíte padrão (`vitest.config.mts`), que é
// 100% unitária e nunca toca no banco. Mantidos em config/comando separados
// de propósito, para o `npm test`/CI normal continuar rodando sem depender de
// banco algum.
//
// `env` aqui garante que `DATABASE_URL` já esteja no `process.env` ANTES de
// qualquer arquivo de teste ser carregado — necessário porque `src/lib/prisma.ts`
// cria o pool de conexão no top-level do módulo (na primeira importação), e
// imports em ESM são resolvidos antes do corpo do próprio arquivo de teste
// rodar `loadEnv()`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
    },
    // Concorrência real precisa dos testes rodando em paralelo dentro do
    // mesmo processo/pool de conexão — mas os arquivos de teste em si rodam
    // sequenciais (fileParallelism false) para não disputar os mesmos dois
    // tenants de QA entre arquivos diferentes. `isolate: false` mantém o
    // mesmo escopo de módulo (e o singleton de `src/lib/prisma.ts`, com seu
    // único pool `pg`) entre os arquivos — sem isso, cada arquivo abria seu
    // próprio pool contra o Neon e a conexão cara ficava instável.
    fileParallelism: false,
    isolate: false,
    testTimeout: 30000,
  },
});
