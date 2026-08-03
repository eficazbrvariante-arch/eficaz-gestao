# PDV offline instalável (Electron) — plano aprovado, projeto PAUSADO

> **Status: pausado antes do início da Etapa 1.** Nenhuma linha de código foi escrita para este projeto.
> Para retomar, abra uma nova conversa mencionando "transformar pdv em soft ativar" — o assistente deve
> ler este arquivo antes de continuar.

## Objetivo

Transformar o PDV (`/pdv`) num aplicativo instalável que continua funcionando sem internet: permite
vender e imprimir o cupom offline, guardando as vendas localmente e sincronizando com o banco (Neon)
assim que a conexão voltar.

## Contexto levantado antes de decidir a tecnologia

- O PDV (`src/app/(admin)/pdv/pdv-screen.tsx`) hoje depende de Server Actions
  (`searchProductsAction`, `createSaleAction` em `src/app/(admin)/pdv/actions.ts`) que rodam no
  servidor e acessam o Prisma/Neon diretamente. Não existe nenhuma via de dados local hoje.
- A lógica de negócio da venda já está separada da Server Action: `src/modules/sales/sale-service.ts`
  exporta `createSale()` puro — reaproveitável por um endpoint REST novo, sem duplicar regra de negócio.
- A sessão usa NextAuth com `strategy: "jwt"` (`src/lib/auth.ts:8`): validar login não depende de
  round-trip ao banco a cada request, o que favorece operar offline depois do primeiro login.
- **Não existia (e ainda não existe) nenhuma integração com impressora térmica no sistema.** O único
  mecanismo de impressão hoje é um botão que chama `window.print()` do navegador
  (`src/app/(admin)/vendas/[id]/sale-controls.tsx`). A impressão térmica silenciosa é um recurso
  novo a ser construído do zero como parte deste projeto — não é algo "já configurado" sendo mantido.
- Não havia nenhum resquício de PWA, Electron ou Tauri no repositório antes deste plano — ponto de
  partida zero.
- Não existe hoje nenhuma busca de venda por número na tela `/vendas` (só listagem com filtro de
  status) — isso também é recurso novo, necessário por causa da numeração offline (ver abaixo).

## Decisão de tecnologia: Electron

Comparado com PWA e Tauri, **Electron foi escolhido** principalmente por causa da impressão
silenciosa automática ("Imprimir automaticamente"), que só existe de forma confiável em Electron
(`webContents.print({ silent: true, deviceName })`, usando o driver Windows já instalado da
impressora, sem diálogo).

| | PWA | Tauri | **Electron (escolhido)** |
|---|---|---|---|
| Impressão silenciosa (sem diálogo) | ❌ não existe | ⚠️ exigiria código nativo Rust por SO, pouco maduro | ✅ API nativa pronta |
| Reaproveita a UI atual (React/Next) | ✅ | ✅ (webview) | ✅ |
| Reaproveita a lógica de negócio (TS/Prisma) | ✅ | ⚠️ parte migraria pra Rust | ✅ fica 100% em Node/TS |
| Usa o driver Windows já instalado da impressora | só com diálogo manual | precisa de crate/plugin pouco maduro | ✅ direto |
| Armazenamento local transacional | IndexedDB (sem SQL real) | SQLite via Rust | ✅ SQLite via Node/Prisma |
| Esforço de empacotamento | nenhum, mas sem print silencioso | binário menor, curva de aprendizado nova (Rust) | maduro (`electron-builder`), equipe fica só em TS |

**Escopo dentro do Electron**: a janela principal carrega o site normalmente — dashboard, produtos,
relatórios etc. continuam 100% como hoje, sem nenhuma mudança. Só a tela do **PDV** ganha uma camada
extra: quando offline, troca a fonte de dados de "Server Action remota" para "SQLite local", usando o
mesmo componente `PdvScreen` por trás de um adaptador de dados — a UI não muda, só de onde os dados
vêm.

## Armazenamento local: SQLite (não IndexedDB)

Via Prisma com um segundo schema/datasource SQLite (ou `better-sqlite3` puro). Motivo: a lógica de
venda já pensa em transações SQL (`prisma.$transaction` em `sale-service.ts`); espelhar isso com
SQLite local é natural e dá transações reais, o que IndexedDB não oferece bem.

Tabelas locais propostas:
- `cached_product` — espelho somente-leitura do catálogo (id, códigos, nome, preços, estoque),
  atualizado periodicamente enquanto online.
- `pending_sale` / `pending_sale_item` / `pending_payment` — vendas feitas offline, com numeração
  local provisória até confirmação no servidor.
- `sync_log` — histórico de tentativas de sincronização (sucesso/erro/retry).

## Fila de sincronização: padrão outbox

1. Toda venda offline vira uma linha em `pending_sale` com status `PENDING`.
2. Um worker no processo principal do Electron detecta conectividade (`online`/`offline` + ping
   periódico) e envia cada `pending_sale` pendente para um **endpoint REST novo**
   (`/api/pdv/sync`, porque Server Actions não são chamáveis de fora do Next) que reaproveita
   `createSale()` de `sale-service.ts` — mesma lógica, mesmas garantias transacionais.
3. Chave de idempotência = ID local da venda, para nunca duplicar em reenvio.
4. Retry com backoff exponencial (ex.: 5s, 15s, 30s, 1min, depois a cada 5min) até confirmar.
5. Ao confirmar, marca `pending_sale` como `SYNCED` e grava o número oficial vindo do servidor.

## Decisão validada: numeração offline provisória com referência permanente

- Cupom impresso offline sai com um número provisório (ex.: `OFFLINE-003`).
- Ao sincronizar, a venda recebe o `number` oficial sequencial normalmente — **mas o número
  provisório não é descartado**: fica gravado para sempre num novo campo `Sale.offlineNumber`
  (`String?`, único por tenant — `@@unique([tenantId, offlineNumber])`) no banco Postgres/Neon
  (mudança de schema real, não só na base local).
- Motivo: o cliente pode voltar só com o cupom mostrando o número provisório (ex.: para fazer uma
  troca), e o sistema precisa localizar a venda por esse número mesmo depois de sincronizada — o
  número antigo nunca "some" da base.

## Decisão validada: busca por número na tela de vendas

- Novo campo de busca **na própria tela `/vendas`** (`src/app/(admin)/vendas/page.tsx`), que hoje só
  tem listagem + filtro de status, sem nenhum campo de busca.
- A busca deve casar tanto com `number` (oficial) quanto com `offlineNumber` (provisório), aceitando
  o valor com ou sem o prefixo `OFFLINE-`.
- Não haverá tela separada dedicada a trocas/devoluções — fica tudo integrado na tela de vendas
  existente.

## Decisão validada: escopo do offline

- **Só o PDV** (buscar produto, montar carrinho, finalizar venda, imprimir cupom) funciona offline.
- Abertura/fechamento de caixa, relatórios, produtos e demais telas **continuam exigindo conexão**,
  como hoje — não entram no escopo deste projeto.

## Decisão validada: estratégia de impressora (sem hardware disponível ainda)

- A impressora térmica Epson TM-T (driver Windows "Receipt6", layout Modelo 222B / 74mm) **ainda não
  está disponível** na máquina de desenvolvimento/testes.
- Abordagem: **não usar ESC/POS bruto**. Gerar o HTML do cupom (reaproveitando o template que já
  existe em `/vendas/[id]`, ajustado para o layout 74mm/Modelo 222B) e imprimir via
  `webContents.print()` do Electron, apontando para o driver Windows da impressora instalada — igual
  online ou offline, porque a impressão é sempre local à máquina do caixa.
- Enquanto a Epson física não chega: desenvolver e validar o fluxo de impressão silenciosa usando um
  driver genérico do Windows (ex.: "Microsoft Print to PDF") para confirmar o comportamento do
  `silent: true` e o layout do cupom em 74mm.
- **Risco em aberto, não resolvido**: a validação real com a impressora Epson TM-T fica pendente até
  o hardware estar disponível para teste. Pode exigir retrabalho na Etapa 5 quando isso acontecer.

## Etapas e estimativa de complexidade

| Etapa | O que entrega | Complexidade |
|---|---|---|
| 1. Spike de arquitetura | Electron carregando o site atual, login (JWT) persistindo, teste de impressão silenciosa (driver genérico, já que a Epson ainda não está disponível) | M (2–4 dias) |
| 2. Camada de dados local | Schema SQLite, cache do catálogo, sincronização de leitura (download periódico) | M (3–5 dias) |
| 3. PDV offline | Adaptador de dados (remoto vs local) no `PdvScreen`, criação de venda offline com numeração provisória (`offlineNumber`) | L (5–8 dias) |
| 4. Fila de sincronização | Endpoint `/api/pdv/sync`, worker de retry/backoff, idempotência, migração do campo `Sale.offlineNumber` | L (5–7 dias) |
| 5. Impressão térmica | Template do cupom (Modelo 222B/74mm) + impressão silenciosa; validado com driver genérico agora, **validação real com a Epson pendente** | M (3–5 dias) |
| 6. Empacotamento | Instalador (`electron-builder`), atualização automática, provisionamento do caixa | M (3–5 dias) |
| 7. QA offline/online | Transições online↔offline, duplicidade, hardware real (quando disponível) | L (5–8 dias) |
| + Busca por número | Campo de busca em `/vendas` casando `number` ou `offlineNumber` | S (2–3 dias, somado ao total abaixo) |

**Total estimado: ~4,5 a 6,5 semanas** de um desenvolvedor dedicado, assumindo que a impressora física
chegue a tempo de validar a Etapa 5/7 — do contrário, essas etapas ficam com validação pendente até o
hardware chegar.

## Para retomar

Quando o usuário mencionar "transformar pdv em soft ativar" numa conversa nova, ler este arquivo por
completo antes de propor qualquer próximo passo. Confirmar com o usuário se alguma decisão mudou
(em especial: a impressora Epson já está disponível para teste?) antes de iniciar a Etapa 1.
