# Auditoria SaaS — Eficaz Gestão

> Documento gerado em 2026-08-18, Etapa A da "Auditoria Mestra" solicitada pelo usuário: análise
> estática completa do código-fonte e do schema Prisma, **sem execução de testes ao vivo contra o
> banco** e **sem nenhuma correção aplicada** (Fase 27 do pedido original: diagnóstico antes de
> agir). Testes reais com Tenant A/Tenant B ficam para a Etapa B, descrita em
> `docs/testes-multitenant.md`.
>
> Metodologia: 5 investigações paralelas e independentes, cada uma lendo o código-fonte relevante
> (schema Prisma de ~1.933 linhas, `src/lib/*`, todos os `*-service.ts` de `src/modules/*`, Server
> Actions e páginas de `src/app/(admin)/**` e `src/app/loja/[subdomain]/**`). Nenhum arquivo de
> código foi alterado durante a auditoria.

## Arquitetura atual (resumo técnico)

- **Stack**: Next.js App Router, TypeScript, Prisma + PostgreSQL (Neon), Server Actions para
  escrita, NextAuth v5 (estratégia JWT) para sessão.
- **Multi-tenant desde o schema**: cada empresa é um `Tenant`; a esmagadora maioria dos ~48
  modelos do banco tem `tenantId` direto. O gate de sessão é centralizado em
  `src/app/(admin)/layout.tsx` → `requireUser()` (`src/lib/session.ts`), que **relê o usuário no
  banco a cada navegação** (papel, status ativo, dispositivo aprovado) — não confia no JWT sozinho.
- **Sem `middleware.ts`**: o roteamento de subdomínio/domínio próprio é feito em `src/proxy.ts`
  (funciona como o middleware, mas não está no caminho convencional `middleware.ts` da raiz), e o
  gate de autenticação do painel administrativo depende do layout `(admin)` — o que significa que
  **Route Handlers (`route.ts`) não herdam automaticamente esse gate** e precisam checar
  `requireUser()`/permissão por conta própria (ver risco ALTO #3 abaixo).
- **Preço**: fonte única bem definida no catálogo online (`resolveEffectiveUnitPrice`,
  `src/modules/products/catalog-price.ts`), sempre recalculada no servidor. O PDV usa uma lógica
  paralela mais simples (`promoPrice ?? salePrice`) que diverge em dois pontos (ver
  `docs/auditoria-estoque-preco.md`).
- **Estoque**: todas as baixas/entradas passam por `StockMovement`, mas nenhuma delas verifica
  saldo disponível antes de decrementar — o maior risco técnico encontrado nesta auditoria (ver
  Risco Crítico #1).

## Mapa multi-tenant (schema Prisma)

Classificação de todos os modelos do schema (`prisma/schema.prisma`):

| Modelo | Tipo | tenantId direto? | Relacionamento com Tenant | Risco | Observação |
|---|---|---|---|---|---|
| Tenant | GLOBAL | — | — | Baixo | Raiz da árvore multi-tenant |
| User | TENANT-SCOPED | Sim | `tenantId` | Baixo | Fonte da sessão |
| AuditLog | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| Device | TENANT-SCOPED | Sim | `tenantId` | Baixo | Checado a cada `requireUser()` |
| AttendanceEntry / AttendanceCorrection | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| Category / Brand / Supplier | TENANT-SCOPED | Sim | `tenantId` | Baixo | `Category`/`Supplier` sem índice próprio (ver auditoria de índices) |
| Product | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| ProductPriceHistory / ProductReview | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| ProductImage / ProductVariant | **DEPENDENTE** | Não | via `Product` | Médio (estrutural) | Sem `tenantId` próprio — depende 100% da disciplina de código |
| StockMovement | TENANT-SCOPED | Sim | `tenantId` | Baixo | Sem `productId` no índice (ver índices) |
| Customer / CustomerSession / CustomerLoginAttempt / CustomerCreditMovement | TENANT-SCOPED | Sim | `tenantId` | Baixo | `CustomerSession` valida tenant explicitamente na leitura — boa defesa em profundidade |
| RepairOrder / RepairOrderPayment | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| RepairOrderItem / RepairOrderPhoto / RepairOrderEvent | **DEPENDENTE** | Não | via `RepairOrder` | Médio (estrutural) | |
| CashRegister / CashMovement | TENANT-SCOPED* | Sim / — | `tenantId` (CashRegister) | Baixo/Médio | `CashMovement` sem índice próprio, sem auditoria centralizada (ver Risco #9) |
| Sale | TENANT-SCOPED | Sim | `tenantId` | Baixo | Sem índice `[tenantId, status]` (ver índices) |
| SaleItem / SaleItemDefectPhoto / Payment | **DEPENDENTE** | Não | via `Sale` | Médio (estrutural) | **Sem nenhum índice** além da PK — risco de performance também |
| SaleItemDefect | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| FiadoEntry / EmployeeLedgerEntry | TENANT-SCOPED | Sim | `tenantId` | Baixo | Fiado sem auditoria centralizada |
| Convenio / ConvenioInvite / ConvenioMember / ConvenioRedemption / ConvenioProductDiscount | TENANT-SCOPED | Sim | `tenantId` | Baixo | Mudança de status de membro sem auditoria centralizada |
| DeliveryZone | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| Order | TENANT-SCOPED | Sim | `tenantId` | Baixo | Tem `publicAccessToken` próprio para acesso público seguro |
| OrderItem | **DEPENDENTE** | Não | via `Order` | Médio (estrutural) | Sem índice próprio |
| VisitorSession / AnalyticsEvent | TENANT-SCOPED | Sim | `tenantId` | Baixo/Médio | `AnalyticsEvent.productId` não é validado contra o tenant na gravação (Risco Médio #13) |
| WhatsAppIntegration / Contact / Conversation / Message / Queue / Tag / QuickReply | TENANT-SCOPED | Sim | `tenantId` | Baixo | |
| WhatsAppConversationTag | DEPENDENTE | Não | junção | Baixo | Sem UI administrativa ainda — sem caminho de exploração |
| ProtecaoEficaz | TENANT-SCOPED | Sim | `tenantId` | Baixo | Modelo com melhor proteção contra concorrência (resgate) do sistema |

**Conclusão do mapa**: a disciplina de isolamento por `tenantId` é muito acima da média para um
sistema que nunca foi desenhado desde o início pensando em múltiplos tenants. O ponto de atenção
estrutural são os modelos "filhos" (`SaleItem`, `Payment`, `OrderItem`, `RepairOrderItem`,
`ProductImage`, `ProductVariant` etc.) sem `tenantId` próprio: hoje protegidos só porque todo
código auditado confirma o pai antes de tocar no filho — nada no banco obriga isso.

## Riscos encontrados, por severidade

### CRÍTICO

**#1 — Estoque pode ficar negativo, de forma garantida em concorrência, tanto no PDV quanto em pedidos online.**
`src/modules/sales/sale-service.ts:391-417` e `src/modules/orders/order-service.ts:508-512`
decrementam `stockQty` (`decrement: quantity`) sem nunca verificar se o saldo é suficiente — nem
antes da transação, nem dentro dela, nem via `updateMany` condicional, nem lock explícito. A
política de estoque padrão `RESERVE` (`Tenant.stockPolicy`, `prisma/schema.prisma:57`) **não
reserva nada de fato** — só adia a baixa até a conclusão manual do pedido, deixando a mesma unidade
livre para ser vendida no PDV enquanto isso. Cenário confirmado por leitura de código (não é
hipotético, é o comportamento normal do sistema): produto com `stockQty = 1`, uma venda no PDV e
um pedido online simultâneos para a mesma unidade — as duas transações commitam com sucesso,
`stockQty` termina em `-1`. Ver detalhamento completo, diagrama e cenário passo a passo em
`docs/auditoria-estoque-preco.md`.

### ALTO

**#2 — Ações de estoque sem checagem de permissão nenhuma.**
`src/app/(admin)/estoque/actions.ts` — `createStockMovementAction` (linhas 11-67) e
`adjustInventoryAction` (linhas 69-122) só chamam `requireUser()`, sem `canManageStock`. As páginas
`estoque/page.tsx`, `estoque/novo/page.tsx` e `estoque/inventario/page.tsx` também não redirecionam
por papel. Isso permite que **qualquer usuário autenticado do tenant**, inclusive o papel
`STOCK_COLLABORATOR` (que por desenho deveria ficar restrito à tela de contagem com foto
obrigatória — comentário explícito em `colaborador-estoque/actions.ts:9-15`), chame a Server
Action diretamente e ajuste o estoque de qualquer produto sem justificativa nem foto, contornando
uma garantia de design anti-fraude do próprio sistema.

**#3 — Exportação de CSV de produtos vaza preço de custo/margem para qualquer usuário autenticado.**
`src/app/(admin)/produtos/exportar/route.ts:6-23` chama `requireUser()` mas não checa
`canManageProducts`/`canViewReports`. Por ser um `route.ts` (Route Handler), não herda o gate de
papel do layout `(admin)` — só o gate de autenticação. Um Vendedor ou Colaborador de Estoque (que
não veem preço de custo em nenhuma outra tela) pode acessar `GET /produtos/exportar` direto pela
URL e baixar toda a margem de lucro da loja. Compare com `relatorios/exportar/route.ts:208`, que
faz a checagem certa (`canViewReports`).

**#4 — Ajuste manual de estoque e inventário em lote fazem leitura fora da transação ("lost update").**
`src/app/(admin)/estoque/actions.ts:16-30` (saída manual) e `:74-90` (inventário) leem `stockQty`
**antes e fora** de `prisma.$transaction`, calculando `delta`/novo valor com esse dado potencialmente
desatualizado. O inventário em lote é o pior caso: usa `SET` absoluto (`stockQty: newQty`), então
uma venda concluída durante a digitação da contagem pode ser "apagada" pelo `update` do inventário.

**#5 — Faltam índices essenciais para os padrões de acesso mais comuns do sistema.**
`SaleItem` e `OrderItem` não têm **nenhum índice** além da chave primária (nem `saleId`/`orderId`,
nem `productId`) — usados em `groupBy`/relatórios de produto mais vendido. `Sale` não tem índice
`[tenantId, status]` (só `[tenantId, createdAt]`), usado em todo relatório e listagem filtrada por
status. `Product` não tem índice em `barcode`, usado na busca do PDV — o caminho de menor latência
tolerável do sistema (leitor de código de barras no caixa). Detalhamento completo em
`docs/plano-correcao.md`.

**#6 — Relatórios agregam em memória em vez de usar `groupBy`/`aggregate` do banco.**
`src/modules/reports/report-service.ts:107-123` (`getDailyRevenue`) e `:275-291`
(`getProductPerformance`) carregam todas as `Sale`/`Order`/`SaleItem`/`OrderItem` do período
inteiro em memória e agregam com `Map`/`Array` em JavaScript. Escala mal com o volume de vendas
**daquele tenant** (não com o número de tenants da plataforma, que já é bem isolado) — um tenant de
alto volume gerando um relatório de 90 dias pode carregar dezenas de milhares de linhas por
requisição.

### MÉDIO-ALTO

**#7 — Login de funcionário sem rate limit/lockout.**
`src/lib/auth.ts:20-33` (`authorize()`) faz `bcrypt.compare` sem contador de tentativas, IP
throttling ou bloqueio. O login de **cliente** da loja tem essa proteção
(`CustomerLoginAttempt`, `src/modules/customers/customer-service.ts:20-22,112-147` — 5
tentativas/usuário, 20/IP em 15 min), mas o login de **funcionário** (incluindo contas ADMIN) não
tem equivalente. Um usuário já autenticado com dispositivo aprovado pode tentar senhas de outra
conta do mesmo tenant indefinidamente.

**#8 — Reset/geração de senha de cliente sem checagem de papel.**
`src/app/(admin)/clientes/actions.ts` — `adminSetCustomerPasswordAction` (linhas 85-95) e
`adminGenerateAndSendPasswordAction` (linhas 104-131) redefinem a senha da conta do cliente na loja
online sem nenhum `canX`. Qualquer funcionário autenticado (ex.: um Estoquista) pode sequestrar o
login de qualquer cliente e acessar saldo de crédito de loja/histórico dele.

**#9 — Sangria/suprimento de caixa fora da trilha de auditoria centralizada.**
`src/app/(admin)/caixa/actions.ts` não importa nem chama `recordAudit` (`src/modules/audit/audit-service.ts`).
O movimento fica registrado na própria tabela `CashMovement` (com autor e data), mas não entra na
auditoria unificada consultável do sistema — inconsistente com o tratamento dado a outras ações
financeiras sensíveis (cancelamento de venda, ajuste de estoque).

### MÉDIO

- **#10 — PDV ignora a janela de promoção que o catálogo online respeita.** `sale-service.ts:180` e
  `pdv/actions.ts:77` usam `promoPrice ?? salePrice` direto, sem checar `isPromoActive`
  (`promoStartedAt`/`promoEndsAt`). Mesmo produto, preço diferente dependendo do canal e do momento.
- **#11 — `promoStockLimit` (teto de unidades em promoção) só vale na exibição, não na cobrança.**
  Não é checado em `createOrder` (`order-service.ts:159-217`), ao contrário do limite de Oferta
  Relâmpago, que é recapado de verdade.
- **#12 — Limite de uso de convênio por período não é travado atomicamente.** `revalidateConvenioMember`
  (`convenio-redemption-service.ts:138-147`) conta usos antes de abrir a transação da venda, sem
  update condicional equivalente ao usado em Proteção Eficaz — duas vendas simultâneas com o mesmo
  convênio podem ambas passar pela checagem de limite.
- **#13 — Vazamento de nome de produto entre tenants concorrentes via Analytics.** `src/app/api/track/route.ts:78-93`
  grava `productId` do evento sem validar que pertence ao tenant resolvido pelo `subdomain`. A
  leitura em `getMostViewedProducts` (`analytics-service.ts:80-83`) busca o nome do produto sem
  filtrar por tenant — um evento forjado com `productId` de um concorrente aparece no painel
  "produtos mais vistos" do atacante.
- **#14 — Cache de domínio próprio por instância serverless, sem invalidação centralizada.**
  `domain-cache.ts` (TTL 60s) é um `Map` em memória por instância; ao transferir/remover um domínio,
  outras instâncias "quentes" da Vercel continuam servindo o tenant antigo até seu próprio TTL
  expirar — janela real (não uma falha de autorização) de conteúdo trocado entre tenants.
- **#15 — Reset de senha de funcionário não revoga sessões JWT já abertas.** `resetUserPasswordAction`
  troca `passwordHash`, mas como a sessão é JWT sem versionamento, uma sessão já aberta continua
  válida até expirar (até 30 dias).
- **#16, #17, #18 — Lacunas de auditoria centralizada**: mudança de status de membro de convênio
  (`convenios/actions.ts:146-173`), criação/baixa de fiado (`clientes/actions.ts:191-230`), e
  cancelamento de OS (`updateRepairOrderStatusAction`, `assistencia-tecnica/actions.ts:109-126`) —
  nenhuma chama `recordAudit`, diferente de ações equivalentes já cobertas (cancelamento de venda).
- **#19 — Erro cru (`error.message`) devolvido ao usuário em falha durante resgate de Proteção Eficaz.**
  `sale-service.ts:493-497` — qualquer erro dentro da transação (incluindo erro de Prisma/Postgres)
  é repassado literalmente ao vendedor.
- **#20 — Índices `tenantId + customerId` faltando em `Sale`, `Order`, `RepairOrder`** — a ficha do
  cliente lista vendas/pedidos/OS sem índice dedicado.

### BAIXO

- `ProductImage`/`ProductVariant`/`SaleItem`/`Payment`/`OrderItem`/`RepairOrderItem` sem `tenantId`
  próprio (item estrutural, sem exploração ativa encontrada).
- `recalcProductRating` e `getRevenueBySeller` fazem uma segunda consulta sem `tenantId` no `where`
  (sem exploração ativa hoje, falta de defesa em profundidade).
- `getStoreByCustomDomain` é código morto com comentário desatualizado.
- `saveDomainAction` não trata erro `P2002` de domínio duplicado (a constraint do banco já impede a
  duplicidade real — só a mensagem de erro fica genérica).
- Domínio próprio não mapeado cai no fallback do painel/login em vez de uma página dedicada.
- `fornecedores/actions.ts` sem checagem de `canManageProducts`; `deleteCustomerAction` sem
  checagem de papel nem registro em auditoria.
- Bootstrap de dispositivo reativa auto-aprovação se a tabela `Device` do tenant ficar vazia (exige
  acesso ao banco para explorar).
- `StockMovement` não rastreia baixas por variante (só o produto pai) — lacuna de auditoria, não de
  integridade numérica.
- Rotas de upload (`produtos`, `ponto`, `convenios`, `protecao-eficaz`) devolvem `error.message` cru
  em caso de falha — hoje só mensagens controladas, mas padrão frágil para mudanças futuras.
  `convenios/upload` é a mais exposta por não exigir login.
- Página de pedido do cliente (`loja/[subdomain]/pedido/[id]/page.tsx`) usa `include` (não `select`)
  no `Order`, trazendo `unitCost` do item — não vaza hoje porque nunca é serializado a um Client
  Component, mas é um padrão frágil.

## Autenticação e autorização — pontos fortes confirmados

- Sessão sempre relida do banco (`requireUser()`) a cada navegação — papel, status ativo e
  dispositivo aprovado nunca dependem só do JWT.
- Troca de papel e desativação de usuário valem **imediatamente** na próxima ação, não esperam o
  cookie expirar.
- Amostra ampla de Server Actions financeiras críticas (criar venda, sangria, mesclar clientes,
  editar comissão, cortesia de OS) revalida a permissão no servidor a partir do papel lido do banco
  — não confia em nenhum dado vindo do cliente.
- Aprovação de dispositivo usa cookie `httpOnly` gerado no servidor (não adivinhável), e a
  revogação de dispositivo também vale imediatamente na próxima requisição.

## Recomendações

Ver `docs/plano-correcao.md` para a lista priorizada (P0–P3) de todas as correções recomendadas
por esta auditoria. Nenhuma foi aplicada nesta rodada, conforme solicitado.
