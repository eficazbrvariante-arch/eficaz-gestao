# Auditoria — Fonte única de estoque e preço

> Etapa A (análise estática), gerado em 2026-08-18. Sem alterações de código. Complementa
> `docs/auditoria-saas.md`.

## 1. Fonte única de preço

### Onde o preço é a fonte de verdade

O **catálogo online** tem uma função central e bem desenhada:

- `src/modules/products/catalog-price.ts:12-17` `computeCatalogPrice` — `promoPrice ?? salePrice`.
- `src/modules/products/catalog-price.ts:26-36` `isPromoActive` — única regra da janela
  `promoStartedAt`/`promoEndsAt`.
- `src/modules/products/catalog-price.ts:66-90` `resolveEffectiveUnitPrice` — combina preço normal
  (respeitando `isPromoActive`), Oferta Relâmpago e desconto de convênio. Reusada em:
  - `order-service.ts:172-202` (`createOrder`, cobrança final)
  - `order-service.ts:411-426` (`createWhatsappLeadOrder`)
  - `checkout/actions.ts:124-147` (`getCartPricingAction`, revalidação antes de finalizar)
  - `catalog-service.ts` (exibição da vitrine)

Isso é o desenho correto: uma função, todos os pontos de exibição e cobrança do catálogo chamam a
mesma coisa. **O carrinho do catálogo (`cart-store.ts`) é só `localStorage`** — preço nunca é
enviado como valor de cobrança para o servidor, apenas `productId`/`variantId`/`quantity`; o
checkout relê tudo do banco. Nenhuma falha do tipo "preço confiado do navegador" foi encontrada
nesse fluxo.

### Onde o PDV diverge

`src/modules/sales/sale-service.ts:180` e `src/app/(admin)/pdv/actions.ts:77` usam
`promoPrice ?? salePrice` **direto**, sem passar por `isPromoActive`/`resolveEffectiveUnitPrice`.
O preço é sempre relido do banco no momento da venda (correto — não vem do cliente), mas:

- **Ignora a janela de promoção.** Uma promoção agendada para começar à meia-noite, ou uma
  promoção vencida sem `promoPrice` limpo, vale no PDV mesmo fora da janela — o catálogo online
  bloqueia corretamente, o balcão não.
- **Ignora totalmente a Oferta Relâmpago** — por desenho, a menos que o negócio queira que ela
  também valha no balcão (a confirmar).

`promoStockLimit` (teto de unidades vendáveis no preço promocional) é usado só para **exibição**
(`catalog-service.ts:106-109`, `:600-603`), nunca é checado em `createOrder`
(`order-service.ts:159-217`) — diferente do limite de Oferta Relâmpago (`flashQtyUsed`,
`order-service.ts:177-183`), que é recapado de verdade no servidor.

### Tabela de cenários (pedida na auditoria)

| Cenário | PDV | Catálogo online | Mesmo valor final? |
|---|---|---|---|
| Produto normal | `salePrice` | `salePrice` | Sim |
| `promoPrice` dentro da janela | `promoPrice` | `promoPrice` | Sim |
| `promoPrice` fora da janela (agendado/vencido) | cobra mesmo assim | respeita a janela | **Não** |
| Oferta Relâmpago ativa | ignorada | preço da oferta | Divergente por desenho |
| Desconto manual no PDV | validado contra `allowDiscount`/regra de película | N/A | Seguro |
| Desconto de convênio | revalidado (`revalidateConvenioMember`) | revalidado | Seguro (ver risco de concorrência abaixo) |
| Resgate Proteção Eficaz (100% na película) | revalidado + trava atômica anti-double-redeem | N/A | Seguro |

### Assistência Técnica e Relatórios

`RepairOrderItem` não é vinculado a `Product` — preço de serviço é digitado livremente por quem
cria/edita a OS, sob permissão (`canManageRepairOrders`). Não é uma falha de "preço vindo do
cliente sem revalidar" — equivale a um caixa digitando um valor avulso, sob controle de papel.
Relatórios (`report-service.ts`) só leem totais já persistidos, nunca recalculam — sem risco de
divergência ali.

## 2. Fonte única de estoque

Diagrama AÇÃO → ALTERAÇÃO → StockMovement → OBSERVAÇÃO para cada operação encontrada:

```
Venda PDV (createSale)
  → Product.stockQty decrementa (dentro da transação)
  → ProductVariant.stockQty decrementa se houver variação
  → StockMovement { type: SALE }  criado só para o produto
  → OBS: baixa da variante não gera StockMovement próprio (schema não tem coluna variantId)

Cancelamento de venda (cancelSale)
  → Product/ProductVariant.stockQty incrementa
  → StockMovement { type: CANCEL_RETURN }
  → Transacional, consistente com a saída original

Reporte de defeito/troca (reportSaleItemDefect)
  → Não mexe em stockQty (comportamento intencional, comentado no código)
  → Não cria StockMovement (correto — produto fica fora até ajuste manual)

Pedido online, política DEDUCT
  → Product/ProductVariant.stockQty decrementa na criação do pedido
  → StockMovement { type: ORDER }
  → Transacional e consistente

Pedido online, política RESERVE (padrão do sistema)
  → NADA decrementa na criação — "reserva" é só nominal, não bloqueia nada de fato
  → Nenhum StockMovement até a conclusão manual

Conclusão de pedido RESERVE → COMPLETED
  → Product/ProductVariant.stockQty decrementa (applyStockDeduction)
  → StockMovement { type: ORDER }
  → Transacional

Cancelamento de pedido já deduzido → CANCELLED
  → Product/ProductVariant.stockQty incrementa (revertStockDeduction)
  → StockMovement { type: ORDER_RETURN }
  → Transacional

Entrada/saída manual (createStockMovementAction)
  → Product.stockQty ajustado por increment/decrement
  → StockMovement { type: IN/OUT/ADJUST }
  → OBS: leitura que calcula o delta acontece FORA da transação (risco de lost update)

Inventário em lote (adjustInventoryAction)
  → Product.stockQty SOBRESCRITO por valor absoluto (não incremento)
  → StockMovement { type: ADJUST }
  → OBS: mesmo problema, agravado por usar SET absoluto em vez de incremento

Assistência Técnica
  → Não usa estoque — RepairOrderItem não tem productId, serviço é texto livre com preço digitado

Colaborador de Estoque (contagem por foto)
  → Só grava confirmação de conferência (lastStockCheckAt) — não altera stockQty
```

**Conclusão**: não foi encontrado nenhum caminho que altere `stockQty` sem criar `StockMovement`
correspondente, nem o inverso. A única lacuna de integridade de **rastro** (não numérica) é a
ausência de `StockMovement` por variante. O problema real está na Tarefa 3 abaixo.

## 3. Transações e concorrência de estoque

### Classificação

| Operação | Classificação |
|---|---|
| `createSale` | Transacional |
| `cancelSale` | Transacional |
| `reportSaleItemDefect` | Transacional |
| `createOrder` / `createWhatsappLeadOrder` | Transacional |
| `updateOrderStatus` | Transacional |
| `createStockMovementAction` (entrada/saída manual) | **Parcialmente transacional** — leitura do delta fica fora da transação |
| `adjustInventoryAction` (inventário) | **Parcialmente transacional** — mesmo problema, agravado por `SET` absoluto |
| `receiveRepairOrderPayment` / `deliverRepairOrder` / `grantRepairOrderCourtesy` | Transacional, isolamento `Serializable` — o módulo mais protegido do sistema |
| Resgate de convênio (`revalidateConvenioMember`) | **Não transacional** — checagem de limite roda antes de abrir a transação da venda |
| Resgate de Proteção Eficaz | Transacional, com trava atômica (`updateMany where redeemedAt: null`) — modelo correto a copiar |

### Risco crítico de estoque negativo (detalhamento)

Nem `createSale` nem `createOrder`/`applyStockDeduction` verificam, em nenhum lugar, se
`stockQty >= quantidade pedida` — não na validação Zod, não antes da transação, não dentro dela,
não como `CHECK` no banco (`stockQty Int @default(0)`, sem `CHECK`). A baixa é sempre um
`decrement` cego:

- `sale-service.ts:391-395` e `:410-417`
- `order-service.ts:508-512` (dentro de `applyStockDeduction`)

A UI também não protege: no PDV, o número de estoque exibido é só texto informativo
(`pdv-screen.tsx:680,760`), sem limitar a quantidade adicionável ao carrinho. No carrinho da loja,
só a linha de Oferta Relâmpago tem limite de quantidade — qualquer outro item pode ter a
quantidade incrementada sem teto.

**Cenário passo a passo (produto com `stockQty = 1`, um cliente compra no PDV e outro no catálogo
online, ao mesmo tempo):**

1. Ambas as leituras iniciais podem ler `stockQty = 1`.
2. A transação do PDV entra primeiro no Postgres, executa `UPDATE ... SET "stockQty" = "stockQty" - 1`
   (a linha é travada), grava `StockMovement SALE -1`, comita — `stockQty` vira `0`.
3. A transação do pedido online, que esperava a linha liberar, roda o mesmo `UPDATE` **sobre o
   valor já atualizado (`0`)** — decrementa para **`-1`**, grava `StockMovement ORDER -1`, comita
   normalmente.
4. As duas vendas são confirmadas com sucesso para os dois clientes. Só existia 1 unidade física.

Isso não é um caso de borda raro — é o comportamento garantido do sistema toda vez que duas
transações disputam a mesma unidade, porque nenhuma das duas checa o resultado antes de comitar.
Vale tanto PDV×PDV quanto PDV×online quanto online×online.

**Correção recomendada (não aplicada nesta rodada)**: trocar o `update` incondicional por um
`updateMany({ where: { id, stockQty: { gte: quantidade } } })` dentro da transação, tratando
`count === 0` como "sem estoque suficiente" — exatamente o padrão que **já existe e funciona** no
resgate de Proteção Eficaz (`sale-service.ts:480-486`). É a mesma técnica, só precisa ser replicada
para venda/baixa de estoque.

### Outros riscos de concorrência

- **Ajuste manual/inventário (ALTO)**: leitura de `stockQty` fora da transação — dois operadores
  ajustando o mesmo produto quase ao mesmo tempo, ou um inventário em lote rodando durante uma
  venda, pode causar "lost update" (o `SET` absoluto do inventário pode apagar uma venda que
  aconteceu durante a digitação da contagem).
- **Limite de uso de convênio (MÉDIO)**: contagem de usos no período não é travada atomicamente —
  duas vendas simultâneas com o mesmo convênio podem ambas passar pela checagem de limite.
- **Política `RESERVE` (informativo)**: é o comportamento documentado no schema, mas o nome pode
  induzir o lojista a pensar que o pedido "trava" o estoque — na prática, múltiplos pedidos
  `RESERVE` pendentes somados a vendas de PDV podem ultrapassar o estoque físico antes de qualquer
  um deles ser concluído. Vale confirmar com o negócio se esse é o comportamento esperado ou se a
  política precisa de uma reserva de verdade (campo `reservedQty`).

## Resumo de riscos desta área

| Severidade | Item |
|---|---|
| CRÍTICO | Estoque pode ficar negativo, de forma garantida em concorrência, no PDV e em pedidos online |
| ALTO | Ajuste manual/inventário em lote com leitura fora da transação (lost update) |
| MÉDIO | PDV ignora janela de promoção que o catálogo online respeita |
| MÉDIO | `promoStockLimit` nunca aplicado na cobrança, só na exibição |
| MÉDIO | Limite de uso de convênio por período não travado atomicamente |
| BAIXO | `StockMovement` não rastreia baixas por variante |
| BAIXO/informativo | Política `RESERVE` não reserva de fato — nome pode induzir a erro |
