-- Lançamentos de colaborador: selfie do próprio colaborador ao lançar algo
-- que pegou da loja (tela Lançamentos) e vínculo do Adiantamento/Mercadoria
-- com o Pagamento por horas que o descontou. Só adiciona colunas opcionais —
-- nenhum dado existente é alterado ou apagado.

-- AlterTable
ALTER TABLE "employee_ledger_entries" ADD COLUMN     "deductedInEntryId" TEXT,
ADD COLUMN     "selfieUrl" TEXT;

-- CreateIndex
CREATE INDEX "employee_ledger_entries_deductedInEntryId_idx" ON "employee_ledger_entries"("deductedInEntryId");

-- AddForeignKey
ALTER TABLE "employee_ledger_entries" ADD CONSTRAINT "employee_ledger_entries_deductedInEntryId_fkey" FOREIGN KEY ("deductedInEntryId") REFERENCES "employee_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
