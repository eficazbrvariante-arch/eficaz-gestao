# Marketplace readiness

> Etapa A (análise estática), gerado em 2026-08-18. **Nada foi implementado** — este documento é
> só avaliação de viabilidade, conforme pedido explicitamente pelo usuário (Fase 20/27 do pedido
> original).

## O que já está pronto

- **Isolamento tenant-scoped é a regra, sem exceção encontrada.** Toda query pública de catálogo
  (`src/modules/catalog/catalog-service.ts`) recebe `tenantId` como parâmetro obrigatório e o
  injeta no `where` via `publicProductWhere(tenantId)`. Não existe hoje nenhum caminho de código
  que liste produtos sem filtro de tenant — o que é uma boa notícia de segurança, mas também
  significa que **a busca cross-tenant do marketplace não existe ainda em nenhuma forma**; é
  trabalho novo do zero, não uma extensão de algo já parcialmente feito.
- **Preço sempre revalidado no servidor** (`resolveEffectiveUnitPrice`), nunca confia em valor do
  cliente — uma futura busca de marketplace pode reusar essa mesma função com segurança para
  exibir preço atual.
- **Um domínio/subdomínio por tenant, com unicidade garantida no banco** (`@unique` em
  `Tenant.subdomain` e `Tenant.customDomain`) — a "loja verificada" do fluxo do marketplace
  (`Marketplace Brusque → produtos de várias lojas → lojas verificadas`) já tem uma âncora estável
  para linkar de volta à loja de origem.
- **Estrutura de dados públicos vs. privados já é respeitada na prática.** Nenhuma rota pública
  auditada devolve `Product`/`Tenant` sem `select` explícito — `costPrice`, `commissionPercent`,
  `email`, `document`, `plan` nunca aparecem em nenhum `select` de rota pública encontrado.

## O que precisa mudar antes de construir o marketplace

### Decisão de arquitetura: `MarketplaceListing` dedicado vs. query cross-tenant direta

Duas abordagens foram avaliadas tecnicamente:

**(a) Query cross-tenant direta em `Product`** — uma função nova rodando
`prisma.product.findMany({ where: { active, showInCatalog, ... } })` sem `tenantId` fixo.
- Esforço: baixo/médio.
- Risco: **médio/alto** — qualquer `select`/`include` mal calibrado nessa função nova (ou um dev
  futuro trocando `select` por `include: { tenant: true }`, que traria `email`/`document`/`plan`)
  expõe dado administrativo de uma empresa para todas as outras e para o público. Exige disciplina
  de `select` explícito toda vez, sem barreira estrutural.
- Performance: essa é a única situação em todo o sistema hoje onde o volume **total** da
  plataforma (ex.: 500 mil produtos de 100 empresas) importaria de verdade — e sem índice de busca
  textual (trigram/full-text, que não existe em nenhuma migration atual), uma busca cross-tenant
  nesse volume faria varredura completa a cada consulta.

**(b) Tabela/view dedicada `MarketplaceListing`, desnormalizada a partir de `Product` + `Tenant`.**
- Esforço: maior inicialmente — precisa de um pipeline de sincronização (trigger de banco, job
  periódico, ou escrita síncrona no mesmo service que já grava `Product`).
- Risco: **baixo** — por construção, só contém os campos explicitamente decididos como públicos.
  Não existe `costPrice`/e-mail/documento nela porque nunca foram replicados; é uma barreira
  estrutural, não uma disciplina de código que pode falhar num PR futuro.
- Performance: melhor — tabela de leitura pública dimensionada e indexada (inclusive full-text) só
  para esse caso de uso, sem competir com a carga transacional do PDV/catálogo administrativo.
- Custo recorrente: manter o job de sincronização — se atrasar/quebrar, o marketplace mostra
  preço/estoque desatualizado (risco de produto, não de segurança).

**Recomendação**: opção (b). Para uma plataforma que vai crescer para dezenas/centenas de empresas
com um marketplace público, o isolamento estrutural entre dado administrativo e dado público
compensa o custo de sincronização — o pior cenário da opção (a) é vazamento de dado privado de
terceiros (irreversível uma vez indexado por crawlers/cache externo), enquanto o pior cenário da
opção (b) é uma listagem desatualizada por alguns minutos.

### Classificação de dados: público vs. nunca público

**Podem ser públicos no marketplace:**
- Loja: nome, nome fantasia, logo, endereço comercial (sem CEP), horário de funcionamento,
  Instagram/WhatsApp de contato, formas de entrega/retirada.
- Produto: nome, imagem, preço de venda (efetivo, já com promoção aplicada), disponibilidade
  (quantidade ou booleano "em estoque"), avaliação média.

**Nunca podem ser públicos** (confirmado ausente hoje em rotas públicas, mas deve ser
explicitamente proibido na tabela/função do marketplace):
- `Product.costPrice`, `Product.commissionPercent`.
- Qualquer dado de `Tenant` além do já listado como público: `email`, `document`, `plan`,
  `saleSequence`/`orderSequence`, `domainToken`.
- `User` (funcionários), `Customer` (exceto o próprio dono da sessão), `Supplier`.
- `Sale`, `Order`, `RepairOrder` de outros clientes.
- `CashRegister`, `CashMovement`, `EmployeeLedgerEntry`, `AuditLog`.

Nenhum vazamento ativo desses campos foi encontrado nas rotas públicas atuais — a checagem acima é
preventiva, para a hora de desenhar a tabela/função do marketplace.

### Índices necessários para busca cross-tenant em escala

Hoje **não existe extensão `pg_trgm`/índice GIN em nenhuma migration** — toda busca por nome usa
`ILIKE` sem índice. Isso já é uma limitação para o catálogo por tenant em escala grande (ver
`docs/auditoria-saas.md`, Risco Alto #5) e seria um bloqueador direto para uma busca cross-tenant
de marketplace com centenas de milhares de produtos. Um índice de texto (trigram ou full-text
search do Postgres) é pré-requisito técnico antes de expor busca pública cross-tenant.

## O que NÃO deve ser construído ainda

Conforme instrução explícita do usuário (Fase 20/27): **nenhum código de marketplace foi escrito
nesta auditoria**, apenas a análise acima. Antes de começar a implementação, os itens P0/P1 de
`docs/plano-correcao.md` (principalmente o Risco Crítico de estoque) deveriam estar resolvidos —
um marketplace aumenta a exposição e o volume de concorrência sobre o mesmo problema de estoque já
identificado, tornando o bug mais visível e mais caro (overselling entre lojas diferentes, visível
publicamente).

## Isolamento administrativo — confirmação relevante para o marketplace

Reforçando o que já está documentado em `docs/testes-multitenant.md`: a análise estática não
encontrou nenhum vazamento crítico ativo entre tenants nas rotas administrativas. O único
vazamento cross-tenant confirmado nesta auditoria (nome de produto via Analytics, ver
`docs/auditoria-saas.md` Risco Médio #13) é uma pista de que, mesmo com boa disciplina geral, o
tipo de erro mais provável ao introduzir qualquer nova superfície cross-tenant é "campo aceito do
cliente sem revalidar contra o tenant certo" — vale ter isso em mente ao desenhar a função/tabela
do marketplace.
