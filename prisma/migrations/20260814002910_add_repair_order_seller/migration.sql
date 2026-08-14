-- AlterTable: adiciona como opcional primeiro, porque a tabela já tem OS
-- existentes sem vendedor definido.
ALTER TABLE "repair_orders" ADD COLUMN     "sellerId" TEXT;

-- Backfill: OS antigas recebem como vendedor quem registrou a OS
-- originalmente — não é o ideal, mas é a melhor informação disponível, e
-- nenhuma linha fica sem vendedor.
UPDATE "repair_orders" SET "sellerId" = "createdById" WHERE "sellerId" IS NULL;

-- Agora que toda linha tem valor, trava como obrigatório daqui pra frente.
ALTER TABLE "repair_orders" ALTER COLUMN "sellerId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
