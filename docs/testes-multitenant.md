# Testes multi-tenant — Tenant A x Tenant B

> **Importante sobre o método usado nesta rodada**: o usuário pediu explicitamente para dividir a
> auditoria em duas etapas (confirmado por escolha explícita antes de começar). A **Etapa A** é uma
> revisão estática — leitura de código e do schema, sem criar dados nem executar nada contra o
> banco; registrada como um "teste mental" rota a rota. A **Etapa B**, executada em 2026-08-18
> contra o banco `dev-local` (Neon), criou de fato dois tenants de QA e rodou as tentativas de
> acesso cruzado, o teste de concorrência de estoque e os testes de fluxo do PDV com dados reais.
> Nenhuma correção de código foi aplicada nesta etapa — só testes e diagnóstico, conforme pedido.

## Etapa A — Revisão estática (concluída em 2026-08-18)

Metodologia: para cada rota/ação sensível, um agente de auditoria leu o código-fonte da Server
Action ou query correspondente e verificou se ela confirma `tenantId` da sessão contra o registro
buscado, **antes** de qualquer leitura/escrita. Fonte: `docs/auditoria-saas.md` (mapa completo) e
os relatórios brutos dos 5 agentes desta auditoria.

### Resultado por rota (Tenant A tentando acessar/alterar dado do Tenant B)

| Tentativa | Rota / ação | Resultado (análise estática) | Evidência |
|---|---|---|---|
| Visualizar produto do B | `/produtos/[id]` | **NEGADO** | Query sempre inclui `tenantId` no `where` |
| Editar produto do B | `updateProductAction` | **NEGADO** | `findFirst` de confirmação antes do `update` |
| Excluir produto do B | ação de exclusão de produto | **NEGADO** | Mesmo padrão de confirmação prévia |
| Visualizar cliente do B | `/clientes/[id]` | **NEGADO** | `tenantId` no `where` |
| Visualizar venda do B | `/vendas/[id]` | **NEGADO** | `tenantId` no `where` |
| Cancelar venda do B | `cancelSaleAction` | **NEGADO** | `cancelSale` valida tenant antes de mutar |
| Acessar pedido do B | `/pedidos/[id]` | **NEGADO** | `tenantId` no `where` |
| Acessar OS do B | `/assistencia-tecnica/[id]` | **NEGADO** | `tenantId` no `where` |
| Acessar usuário do B | `/usuarios/actions.ts` | **NEGADO** | `tenantId` no `where` |
| Acessar caixa do B | `/caixa`, `getCashSummary` | **NEGADO** | `tenantId` no `where` |
| Acessar relatório do B | `/relatorios/*` | **NEGADO** | Todas as agregações (`report-service.ts`) filtram por `tenantId` |
| Acessar configuração do B | `/configuracoes/*` | **NEGADO** | `tenantId` da sessão em todas as leituras/escritas |

**Nenhuma dessas 12 tentativas obteve acesso indevido na análise estática** — resultado
consistentemente NEGADO, como esperado. Isso é uma leitura de código, não uma prova executada; a
Etapa B deve confirmar isso rodando as chamadas de verdade.

### Achados relevantes desta revisão (fora do padrão "acesso direto por ID")

Mesmo sem vazamento ativo nas 12 rotas acima, a auditoria encontrou dois desvios que pertencem à
categoria "isolamento entre tenants", registrados em detalhe em `docs/auditoria-saas.md`:

1. **MÉDIO — vazamento de nome de produto entre tenants concorrentes via Analytics.**
   `POST /api/track` grava `productId` de evento sem confirmar que ele pertence ao tenant resolvido
   pelo `subdomain` enviado. Um tenant pode gravar um evento de "visualização" apontando para um
   `productId` de um concorrente (descoberto navegando o catálogo público dele) e esse produto
   passa a aparecer na lista de "mais vistos" do painel de Analytics do atacante — vazando o nome
   do produto. Ver `src/app/api/track/route.ts:78-93` e `analytics-service.ts:80-83`.
2. **MÉDIO — janela de cache de domínio.** Após transferir/remover um domínio próprio, outras
   instâncias serverless podem continuar servindo o tenant anterior por até ~60s cada (cache em
   memória por instância, sem invalidação centralizada). Não é falha de autorização — é uma janela
   de conteúdo trocado. Ver `src/modules/domain/domain-cache.ts`.

Nenhum outro vazamento cross-tenant foi encontrado nesta etapa.

## Etapa B — Testes ao vivo (executada em 2026-08-18)

Rodada contra o banco `dev-local` (Neon), nunca produção — confirmado lendo `.env.local` antes de
executar qualquer coisa (`DATABASE_URL` aponta para `ep-fragrant-frog-ac9yf3aa-pooler...`, a branch
de desenvolvimento). Nenhuma correção de código foi aplicada; o objetivo era só confirmar (ou não)
o diagnóstico da Etapa A com dados reais.

### O que foi criado

- `scripts/qa-multitenant-seed.mts` — cria **Tenant A "QA Loja Teste A"** (política de estoque
  `RESERVE`) e **Tenant B "QA Loja Teste B"** (política `DEDUCT`), cada um com: administrador,
  vendedor, categoria, fornecedor, cliente, produto normal (estoque 100), produto dedicado à
  concorrência (`stockQty = 1`), caixa aberto, 1 venda de PDV, 1 pedido online, 1 OS de assistência
  técnica, 1 lançamento de colaborador (adiantamento), 1 convênio com 1 colaborador vinculado.
  Idempotente — remove qualquer resquício dos dois subdomínios antes de recriar.
- `scripts/qa-multitenant-cleanup.mts` — remove os dois tenants por completo, filtrando
  estritamente pelos subdomínios `qa-loja-teste-a`/`qa-loja-teste-b`.
- `vitest.config.integration.mts` + script `npm run test:integration` — suíte de integração
  separada da suíte unitária padrão (`vitest.config.mts`, que segue 100% sem tocar banco). Roda com
  `isolate: false` e `fileParallelism: false` para os 3 arquivos de teste compartilharem o mesmo
  singleton de conexão (`src/lib/prisma.ts`) em vez de abrir um pool por arquivo (a primeira
  tentativa, com isolamento padrão do Vitest, derrubava a conexão com o Neon).
- `src/modules/qa/qa-fixtures.ts` — carrega os dois tenants de QA já semeados.
- `src/modules/qa/multitenant-isolation.integration.test.ts` — as 12 tentativas de acesso cruzado.
- `src/modules/qa/stock-concurrency.integration.test.ts` — o teste mais importante desta etapa.
- `src/modules/qa/sale-flows.integration.test.ts` — cancelamento duplo e pagamento misto/arredondamento.

Comandos: `npm run qa:multitenant:seed` → `npm run test:integration` → `npm run qa:multitenant:cleanup`.

### Resultado real — matriz de acesso cruzado (12 tentativas)

Todas as 12 tentativas usaram a função de serviço/query real do sistema (não uma simulação),
chamada com o `tenantId` do Tenant A e o `id` de um registro do Tenant B.

| # | Tentativa | Função/query real usada | Resultado real | Evidência |
|---|---|---|---|---|
| 1 | Visualizar produto do B | `prisma.product.findFirst({ id, tenantId })` | **NEGADO** ✅ | `multitenant-isolation.integration.test.ts:24` |
| 2 | Editar produto do B | mesmo `findFirst` de confirmação usado por `updateProductAction` | **NEGADO** ✅ | `:31` |
| 3 | Excluir produto do B | `prisma.product.deleteMany({ id, tenantId })` | **NEGADO** ✅ (0 registros afetados, produto continua existindo) | `:39` |
| 4 | Visualizar cliente do B | `prisma.customer.findFirst({ id, tenantId })` | **NEGADO** ✅ | `:47` |
| 5 | Visualizar venda do B | `prisma.sale.findFirst({ id, tenantId })` | **NEGADO** ✅ | `:53` |
| 6 | Cancelar venda do B | `cancelSale(tenantIdA, saleIdB, ...)` (função real) | **NEGADO** ✅ — erro `"Venda não encontrada."`, status da venda de B continua `COMPLETED` | `:59` |
| 7 | Acessar pedido do B | `prisma.order.findFirst({ id, tenantId })` | **NEGADO** ✅ | `:69` |
| 8 | Acessar OS do B | `updateRepairOrderStatus(tenantIdA, repairOrderIdB, "ANALYZING")` (função real) | **NEGADO** ✅ — erro `"Ordem de serviço não encontrada."`, status da OS de B continua `RECEIVED` | `:75` |
| 9 | Acessar usuário do B | `prisma.user.findFirst({ id, tenantId })` | **NEGADO** ✅ | `:87` |
| 10 | Acessar caixa do B | `prisma.cashRegister.findFirst({ id, tenantId })` | **NEGADO** ✅ | `:93` |
| 11 | Acessar relatório do B | `getSalesSummary(tenantIdA, período)` (função real) — antes/depois de criar uma venda nova só em B | **NEGADO** ✅ — o total de A não mudou; o total de B refletiu a venda nova | `:99` |
| 12 | Acessar/alterar configuração do B | `prisma.tenant.update({ where: { id: tenantIdA }, ... })` | **NEGADO** ✅ — `Tenant` B permanece byte a byte igual (`updatedAt` inalterado) | `:150` |

**Resultado: 12/12 NEGADO — confirma com dados reais o que a Etapa A já indicava por leitura de código.** Nenhum vazamento cross-tenant encontrado nesta matriz.

### Resultado real — concorrência de estoque (o teste mais importante)

Produto dedicado (`stockQty` resetado para `1` antes de cada rodada), 3 rodadas por cenário,
disparando as duas operações com `Promise.all` de verdade:

**PDV × PDV simultâneos (Tenant A, mesmo caixa, duas vendas ao mesmo tempo):**

| Rodada | Venda 1 (admin) | Venda 2 (vendedora) | `stockQty` final |
|---|---|---|---|
| 1 | OK | OK | **-1** |
| 2 | OK | OK | **-1** |
| 3 | OK | OK | **-1** |

**3 de 3 rodadas terminaram com estoque negativo.** As duas vendas foram aceitas com sucesso nas 3
tentativas — nenhuma foi rejeitada por falta de estoque, porque essa checagem não existe.

**PDV × Pedido online simultâneos (Tenant B, política `DEDUCT`, venda de balcão e pedido do
catálogo ao mesmo tempo):**

| Rodada | Venda PDV | Pedido online | `stockQty` final |
|---|---|---|---|
| 1 | OK | OK | **-1** |
| 2 | OK | OK | **-1** |
| 3 | OK | OK | **-1** |

**3 de 3 rodadas terminaram com estoque negativo.** Mesmo resultado — confirma que o problema vale
tanto para dois canais PDV quanto para PDV×catálogo online, exatamente como `docs/auditoria-estoque-preco.md`
já descrevia.

**Conclusão**: o Risco Crítico #1 (`docs/auditoria-saas.md`) está **confirmado com dados reais, não
só por leitura de código** — em 6 de 6 rodadas testadas (2 cenários × 3 rodadas cada), o sistema
aceitou as duas vendas concorrentes da última unidade e terminou com `stockQty = -1`. Nenhuma
tentativa foi rejeitada. Este é agora o item de maior prioridade em `docs/plano-correcao.md` (P0 #1).

### Resultado real — cancelamento duplo

Venda criada, cancelada uma vez (aceita, estoque devolvido corretamente), cancelada uma segunda vez
com o mesmo `saleId`: **rejeitada** com erro `"Esta venda já está cancelada."`, e o estoque
permaneceu no valor correto (não foi devolvido duas vezes). Comportamento correto, confirmado com
dados reais — sem risco encontrado aqui.

### Resultado real — pagamento misto e tolerância de arredondamento

Venda de R$100,00 (2 unidades de R$50) testada com 4 combinações de pagamento:

| Cenário | Resultado |
|---|---|
| Dinheiro (R$20) + Débito (R$30) + PIX (R$50) = R$100,00 exato, 3 formas | **Aceita** ✅ |
| PIX único de R$99,99 (diferença de R$0,01) | **Rejeitada** ✅ — `"A soma dos pagamentos ... não corresponde ao total da venda"` |
| PIX único de R$100,01 (diferença de R$0,01) | **Rejeitada** ✅ — mesmo erro |
| PIX único de R$100,00 exato | **Aceita** ✅ |

Confirma que a tolerância real de arredondamento (`CENT = 0.005`, meio centavo, em
`sale-service.ts:15`) funciona como documentado: uma diferença de 1 centavo inteiro é sempre
rejeitada, split em várias formas é aceito quando a soma bate exatamente. Sem risco encontrado
aqui.

### O que não foi testado nesta rodada

- **Fase 25 (onboarding de empresa nova sem alteração de código)**: não incluída nesta Etapa B por
  escopo/tempo — o script de seed já demonstra na prática que criar uma empresa nova não exige
  nenhuma alteração de código (só chamadas normais aos services), mas o fluxo completo via UI
  (cadastro → configurar catálogo → publicar produto → configurar domínio) não foi percorrido
  ponta a ponta. Recomendado como próximo passo se o usuário quiser essa confirmação específica.
- **Limite de uso de convênio sob concorrência** e **vazamento de nome de produto via `/api/track`**
  (achados MÉDIO da Etapa A): não reproduzidos ao vivo nesta rodada — permanecem como diagnóstico
  estático até uma futura extensão desta suíte.

### Estado do banco após a Etapa B

`npm run qa:multitenant:cleanup` executado ao final — confirmado por query direta que
`qa-loja-teste-a` e `qa-loja-teste-b` não existem mais no banco `dev-local`. Nenhum outro dado foi
tocado.
