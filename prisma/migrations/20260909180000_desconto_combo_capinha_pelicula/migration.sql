-- Desconto automático de combo "capinha + película de hidrogel".
-- Colunas puramente aditivas, com DEFAULT: nenhuma venda existente muda de
-- valor (todas passam a ter comboDiscount = 0, que é o que de fato foi
-- cobrado nelas) e nenhum dado é reescrito.

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "comboDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "comboDiscountUnits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: palavras-chave e valor por combo, editáveis em
-- Configurações > Descontos. NULL = usa o padrão definido no código.
ALTER TABLE "tenants" ADD COLUMN     "comboDiscountSettings" JSONB;
