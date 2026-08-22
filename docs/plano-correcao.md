# Plano de correção — priorizado

> Etapa A (diagnóstico), gerado em 2026-08-18. **Nenhuma correção foi aplicada nesta rodada**,
> conforme instrução explícita do usuário (Fase 27 do pedido original). Esta lista ordena o que a
> auditoria encontrou em `docs/auditoria-saas.md`, `docs/auditoria-estoque-preco.md` e
> `docs/marketplace-readiness.md`.

## P0 — Crítico (bloqueia aceitar uma segunda empresa real / expandir a plataforma)

1. **Corrigir decremento cego de estoque no PDV e em pedidos online.** Trocar `update`
   incondicional por `updateMany({ where: { id, stockQty: { gte: quantidade } } })` dentro da
   transação em `sale-service.ts:391-417` e `order-service.ts:508-512`; tratar `count === 0` como
   estoque insuficiente. Reusar o padrão já validado em `sale-service.ts:480-486` (Proteção
   Eficaz). Vale para produto e variante.
2. **Adicionar checagem de `canManageStock` em `estoque/actions.ts`** (`createStockMovementAction`,
   `adjustInventoryAction`) e redirect por papel nas páginas `estoque/page.tsx`,
   `estoque/novo/page.tsx`, `estoque/inventario/page.tsx` — seguir o padrão já usado em
   `produtos/actions.ts`/`convenios/actions.ts` (`requireProductManager()`/`requireConvenioManager()`).
3. **Adicionar checagem de papel em `produtos/exportar/route.ts`** (`canManageProducts` ou
   `canViewReports`, igual ao padrão já correto de `relatorios/exportar/route.ts`).
4. **Mover a leitura de `stockQty` para dentro da transação** em ajuste manual e inventário em
   lote (`estoque/actions.ts:16-30,74-90`), evitando "lost update"; considerar trocar o `SET`
   absoluto do inventário por uma comparação explícita contra o valor lido dentro da mesma
   transação.

## P1 — Importante (antes de escalar/expor a mais empresas)

5. **Rate limit/lockout no login de funcionário** (`src/lib/auth.ts:20-33`) — replicar o padrão já
   existente em `CustomerLoginAttempt` para contas `User`.
6. **Checagem de papel em `clientes/actions.ts`** (`adminSetCustomerPasswordAction`,
   `adminGenerateAndSendPasswordAction`) — restringir a um papel definido (ex.: `canManageSettings`
   ou permissão dedicada) e registrar em `recordAudit`.
7. **Índices de banco faltando** (ver `docs/auditoria-saas.md`, Risco Alto #5):
   - `SaleItem`: `@@index([saleId])`, `@@index([productId])`
   - `OrderItem`: `@@index([orderId])`, `@@index([productId])`
   - `Sale`: `@@index([tenantId, status, createdAt])`
   - `Product`: `@@index([tenantId, barcode])`
   - `Sale`/`Order`/`RepairOrder`: `@@index([tenantId, customerId])`
   - `StockMovement`: `@@index([tenantId, productId, createdAt])`
8. **Corrigir PDV para respeitar a fonte única de preço**: usar `isPromoActive`/
   `resolveEffectiveUnitPrice` (ou equivalente) em vez de `promoPrice ?? salePrice` cru, e aplicar
   `promoStockLimit` na cobrança de `createOrder`, não só na exibição.
9. **Travar atomicamente o limite de uso de convênio por período** — mesmo padrão de update
   condicional usado em Proteção Eficaz, movendo a checagem para dentro da transação de
   `createSale`.
10. **Corrigir vazamento de nome de produto via Analytics**: validar em `/api/track` que
    `productId` pertence ao tenant resolvido pelo `subdomain` antes de gravar; adicionar
    `tenantId` ao `where` da segunda query em `getMostViewedProducts`.
11. **Cobrir lacunas de auditoria centralizada**: adicionar `recordAudit` para sangria/suprimento
    de caixa (`caixa/actions.ts`), mudança de status de membro de convênio
    (`convenios/actions.ts:146-173`), criação/baixa de fiado (`clientes/actions.ts:191-230`), e
    cancelamento de OS (`assistencia-tecnica/actions.ts:109-126`).

## P2 — Melhoria (qualidade/robustez, sem risco imediato de exploração confirmada)

12. Revogar sessões JWT de funcionário ao resetar senha (versionamento de sessão em `User`).
13. Refatorar `getDailyRevenue`/`getProductPerformance` (`report-service.ts`) para usar
    `groupBy`/`aggregate` do Prisma em vez de agregação em memória.
14. Trocar `include` por `select` explícito na página de pedido do cliente
    (`loja/[subdomain]/pedido/[id]/page.tsx`) para não carregar `unitCost` desnecessariamente.
15. Padronizar mensagens de erro genéricas nas rotas de upload (`produtos`, `ponto`, `convenios`,
    `protecao-eficaz`) e no resgate de Proteção Eficaz (`sale-service.ts:493-497`) — nunca repassar
    `error.message` cru.
16. Checagem de papel em `fornecedores/actions.ts` (`canManageProducts`); checagem de papel +
    `recordAudit` em `deleteCustomerAction`.
17. Adicionar `tenantId` redundante em queries de "defesa em profundidade" apontadas na auditoria
    (`recalcProductRating`, `getRevenueBySeller`, chamadas dentro de `mergeCustomers`).
18. Avaliar se a janela de até ~60s do cache de domínio (`domain-cache.ts`) é aceitável ou se
    merece invalidação centralizada (ex.: Redis/pub-sub) — depende da frequência esperada de
    transferência de domínio entre tenants.
19. `StockMovement` passar a registrar baixas por variante (adicionar coluna `variantId`).

## P3 — Futuro (arquitetural, sem urgência)

20. Adicionar `tenantId` denormalizado aos modelos "filhos" (`SaleItem`, `Payment`, `OrderItem`,
    `RepairOrderItem`, `RepairOrderPhoto`, `RepairOrderEvent`, `ProductImage`, `ProductVariant`,
    `SaleItemDefectPhoto`) como defesa estrutural e possível base para Row-Level Security no
    Postgres no futuro.
21. Desenhar e construir a tabela dedicada `MarketplaceListing` (ver `docs/marketplace-readiness.md`)
    — **não iniciar antes dos itens P0 estarem resolvidos**.
22. Adicionar observabilidade externa de erros (ex.: Sentry) — hoje não há nenhuma integração, e
    erros não tratados só aparecem no log da Vercel sem alerta/agregação.
23. Confirmar com o usuário: plano Neon atual de produção, janela de PITR/retenção de backup
    automático desse plano, política de retenção de branches de backup manuais (ex.:
    `backup-antes-reset-vendas-20260811`), e definir um processo formal de disaster recovery
    (RTO/RPO) — hoje a prática observada é reativa (branch manual antes de operação arriscada).
24. Página dedicada de "domínio não configurado" em vez do fallback atual para o painel/login.
25. Remover código morto (`getStoreByCustomDomain`) ou alinhá-lo ao padrão de
    `resolveCustomDomain`.
26. Adicionar índice de texto (trigram/full-text) em `Product.name` — hoje toda busca usa `ILIKE`
    sem índice; vira prioridade mais alta se algum tenant crescer muito (20k+ produtos) ou quando o
    marketplace (P3 #21) for iniciado.

## Como usar este plano

Cada item pode virar uma tarefa isolada e pequena — nenhum exige refatoração grande. Recomenda-se
seguir a ordem P0 → P1 antes de aceitar a segunda empresa paga na plataforma; P2/P3 podem ser
distribuídos ao longo do tempo sem bloquear o roadmap comercial.
