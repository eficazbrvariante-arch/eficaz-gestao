-- AlterTable: tenants ganha "email" (e-mail de acesso da empresa/PDV).
-- Adicionado como nullable primeiro para poder fazer o backfill abaixo antes
-- de exigir NOT NULL + UNIQUE, sem quebrar tenants já existentes.
ALTER TABLE "tenants" ADD COLUMN "email" TEXT;

-- Backfill: usa o e-mail do primeiro usuário ADMIN de cada tenant.
UPDATE "tenants" t SET "email" = (
  SELECT u.email FROM "users" u
  WHERE u."tenantId" = t.id AND u.role = 'ADMIN' AND u.email IS NOT NULL
  ORDER BY u."createdAt" ASC LIMIT 1
) WHERE t."email" IS NULL;

-- Fallback defensivo: tenant sem nenhum ADMIN (não deveria acontecer hoje) usa
-- o e-mail do primeiro usuário de qualquer papel, para a migration nunca falhar.
UPDATE "tenants" t SET "email" = (
  SELECT u.email FROM "users" u
  WHERE u."tenantId" = t.id AND u.email IS NOT NULL
  ORDER BY u."createdAt" ASC LIMIT 1
) WHERE t."email" IS NULL;

ALTER TABLE "tenants" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- AlterTable: users.email vira opcional — login não depende mais dele
-- (ver tenants.email); mantém o índice único (Postgres permite múltiplos NULL).
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
