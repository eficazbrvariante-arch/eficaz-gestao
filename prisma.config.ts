import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Mesma precedencia do Next.js: .env.local primeiro (nao sobrescrito depois),
// .env como fallback para quem nao tiver .env.local.
loadEnv({ path: ".env.local" });
loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // As migrações exigem uma conexão DIRETA (de sessão) e falham através do
    // pooler. Em produção o app usa a URL com "-pooler" em DATABASE_URL, e as
    // migrações usam DIRECT_DATABASE_URL. Em desenvolvimento existe só a direta.
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
