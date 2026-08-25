-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "pdvRankingEnabled" SET DEFAULT true;

-- Ranking do rodapé do PDV passa a ser permanente por padrão: liga também
-- pros tenants já existentes, não só pros novos.
UPDATE "tenants" SET "pdvRankingEnabled" = true;
