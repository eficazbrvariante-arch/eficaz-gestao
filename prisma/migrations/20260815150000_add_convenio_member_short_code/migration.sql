-- AlterTable: nullable first, existing rows precisam ganhar um valor antes do NOT NULL.
ALTER TABLE "convenio_members" ADD COLUMN     "shortCode" TEXT;

-- Backfill: gera um código de 6 dígitos único por tenant pros colaboradores já
-- cadastrados antes deste recurso existir. Poucas linhas na prática — o laço
-- de colisão aqui é rede de segurança, não algo esperado de disparar de verdade.
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
BEGIN
  FOR r IN SELECT "id", "tenantId" FROM "convenio_members" WHERE "shortCode" IS NULL LOOP
    LOOP
      new_code := lpad(floor(random() * 1000000)::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "convenio_members"
        WHERE "tenantId" = r."tenantId" AND "shortCode" = new_code
      );
    END LOOP;
    UPDATE "convenio_members" SET "shortCode" = new_code WHERE "id" = r."id";
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "convenio_members" ALTER COLUMN "shortCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "convenio_members_tenantId_shortCode_key" ON "convenio_members"("tenantId", "shortCode");
