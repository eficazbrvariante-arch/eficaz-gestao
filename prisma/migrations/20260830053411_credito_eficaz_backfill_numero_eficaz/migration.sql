-- Corrige o índice único de "Número Eficaz": precisa ser único POR EMPRESA
-- (mesma convenção de `Sale.number` — `@@unique([tenantId, number])`), não
-- globalmente — cada tenant numera seus clientes a partir de EF-000001.
-- (A migration anterior criou por engano um índice único global; nunca foi
-- usado em produção, corrigido aqui antes do backfill.)
DROP INDEX "customers_eficazNumber_key";
CREATE UNIQUE INDEX "customers_tenantId_eficazNumber_key" ON "customers"("tenantId", "eficazNumber");

-- Backfill: numera todo cliente já existente com o "Número Eficaz"
-- (EF-000001, EF-000002, ...), sequencial por empresa, na ordem de criação
-- do cadastro. Cliente novo, criado depois desta migration, já nasce com o
-- número gerado a partir de `Tenant.customerSequence` (ver
-- `src/modules/customers/customer-service.ts`).
WITH numbered AS (
  SELECT id, "tenantId", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS rn
  FROM customers
  WHERE "eficazNumber" IS NULL
)
UPDATE customers c
SET "eficazNumber" = 'EF-' || LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE c.id = numbered.id;

-- Continua a numeração sem colisão: o contador da empresa passa a valer pelo
-- menos o total de clientes já numerados.
UPDATE tenants t
SET "customerSequence" = sub.cnt
FROM (
  SELECT "tenantId", COUNT(*) AS cnt FROM customers GROUP BY "tenantId"
) sub
WHERE t.id = sub."tenantId" AND t."customerSequence" < sub.cnt;
