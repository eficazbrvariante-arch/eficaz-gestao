# Relatórios de sessão

## 2026-08-13 — Bug de produtos duplicados na importação + conferência por forma de pagamento no fechamento de caixa

**Pedido 1:** usuário viu 4 produtos "Máquina de barbear" duplicados no
filtro "Sem estoque" da loja em produção (1754 produtos). Investigação:
`importProductsFromCsv` (`src/modules/products/import-service.ts`) só
verificava produto já existente pelo `codigo_interno` da linha do CSV;
quando essa coluna vinha vazia, a busca nunca encontrava nada e cada
reimportação do CSV criava um produto novo em vez de atualizar o
existente. Confirmado por consulta ao banco `dev-local` que há vários
produtos legítimos (acessórios genéricos) dividindo o mesmo código de
barras de fábrica — todos com `codigo_interno` preenchido — então usar
`barcode` como fallback só quando `codigo_interno` estiver vazio não
quebra esses casos.

**O que mudou:**
- `src/modules/products/import-service.ts`: fallback para buscar produto
  existente por `barcode` quando a linha não tem `codigo_interno`.

**Os 4 registros duplicados em produção não existem no `dev-local`**
(criados depois do último snapshot da branch de dev) — não acessei
produção. Orientei o usuário a excluir manualmente pelo painel de
Produtos (o botão "Excluir" já bloqueia sozinho se o produto tiver venda
no histórico).

**Pedido 2:** no fechamento de caixa (`/caixa`), só o campo de dinheiro
era conferível — débito, crédito e Pix apareciam só como texto de
referência (e esse texto já estava com bug: somava só vendas do PDV,
esquecendo recebimentos da Assistência Técnica no mesmo caixa). Pedido:
inputs editáveis pré-preenchidos com o valor esperado para as 4 formas
(dinheiro, débito, crédito, Pix — fiado e crédito de loja ficaram de fora
por não serem valor físico/imediato), com diferença calculada por forma,
igual já acontecia só para dinheiro. Confirmado com o usuário: o
fechamento continua escopado ao caixa aberto da loja inteira (não existe
"caixa por vendedor" no sistema — só um caixa aberto por vez).

**O que mudou:**
- `prisma/schema.prisma` (`CashRegister`): 6 campos novos —
  `countedDebitAmount`/`expectedDebitAmount`,
  `countedCreditAmount`/`expectedCreditAmount`,
  `countedPixAmount`/`expectedPixAmount` — migration
  `20260813184449_add_cash_register_payment_breakdown` (aplicada no
  `dev-local`).
- `src/lib/validations/cash.ts`: `closeCashSchema` ganha os 3 campos de
  conferência.
- `src/app/(admin)/caixa/cash-forms.tsx`: `CloseCashForm` ganha input +
  linha de diferença para débito/crédito/Pix (mesmo padrão do dinheiro).
- `src/app/(admin)/caixa/page.tsx`: passa `totalDebit/totalCredit/totalPix`
  (soma PDV + Assistência Técnica) pro formulário, corrigindo o valor de
  referência que já estava errado.
- `src/app/(admin)/caixa/actions.ts`: `closeCashRegisterAction` grava os
  6 campos novos ao fechar o caixa.

**Não mexi** no histórico de caixas (`/caixa/historico`) — continua
mostrando só o resumo em dinheiro; dá pra estender depois se quiser ver
a diferença por forma ali também.

**Testado:** `lint`, `typecheck` e `build:app` (build sem migrate deploy)
limpos, sem warnings novos. **Não testei visualmente no navegador** — o
login do ambiente de teste exige senha, e não digito senhas em nenhum
campo por política, mesmo em ambiente local. Servidor de dev deixado
rodando (`npm run dev`) para o usuário conferir a tela `/caixa` na prática.

**Nada commitado nem enviado a produção** — migration só aplicada no
`dev-local`; vai para produção no próximo deploy normal
(`npm run build`, que roda `prisma migrate deploy`).

## 2026-08-12 — PDV volta sozinho pra nova venda ao finalizar

**Pedido do usuário:** ao finalizar uma venda no PDV, o sistema navegava para
a página de comprovante (`/vendas/[id]?nova=1`) e ficava lá — o operador
precisava clicar em "Nova venda" pra voltar. Pedido: voltar direto pro PDV,
pronto pra próxima venda, sem esse passo manual.

**O que mudou:**
1. `src/app/(admin)/pdv/pdv-screen.tsx`: ao finalizar a venda com sucesso, o
   PDV não navega mais para o comprovante — reseta o próprio estado
   (carrinho, cliente, pagamentos, vendedor — este último força nova seleção
   por venda, mesmo comportamento de antes) e chama `router.refresh()` só
   pra atualizar o resumo "Vendas neste caixa" do topo, sem perder o estado
   do formulário. Um aviso verde aparece no lugar ("Venda #X registrada com
   sucesso" + troco, se houver) com um link "Imprimir comprovante" (abre o
   recibo em nova aba) e um botão de fechar — cobre quem ainda precisa
   imprimir, sem travar a volta ao PDV.
2. `src/app/(admin)/pdv/actions.ts`: `createSaleAction` ganhou tipo de
   retorno explícito (`{ error: string } | { saleId; number; changeAmount }`)
   — sem isso o TypeScript inferia `saleId`/`number` como possivelmente
   `undefined` mesmo depois do narrowing por `"saleId" in result`, e o novo
   código (que agora usa esses campos num objeto tipado, não só numa
   template string) não compilava.

**Testado:** `lint`, `typecheck` e `build:app` sem erros nem warnings novos.
Testado manualmente no navegador contra `dev-local`: criado um usuário ADMIN
temporário só pra login (tenant real não tinha credencial conhecida),
aberto o caixa, feita uma venda completa de R$7,00 com R$10,00 em dinheiro —
confirmado que a tela fica no PDV, carrinho/vendedor resetados, aviso "Venda
#1 registrada com sucesso · Troco: R$ 3,00" aparece, "Vendas neste caixa" no
topo atualiza pra "1 · R$ 7,00", e "Imprimir comprovante" abre o recibo
correto. Usuário de teste, a venda de teste e o caixa aberto para o teste
foram removidos do `dev-local` depois (estoque devolvido).

**Observação:** durante o teste, havia um processo Node órfão (de uma sessão
anterior) preso na porta 3000 sem responder — encerrado com autorização do
usuário para conseguir subir um servidor de dev limpo.

**Commits e deploy:** dois commits a pedido do usuário — `e926b2a` (só o
script `scripts/reset-vendas-pedidos.mts`, de uma sessão anterior) e
`fa6aeb5` (mudança do PDV + este relatório). Push pra `origin/main`
(`65e1a15..fa6aeb5`), deploy automático na Vercel confirmado com
`npm run check:deploy` — tudo OK (painel, loja, produto, categoria, rota
`comprar-whatsapp`, sem erros nos logs).

**Validado em produção:** com autorização do usuário, feita uma venda real
de teste no PDV de produção (Adaptador 3 saídas, R$7,00, vendedor "Vendedor
teste") — confirmado visualmente o comportamento novo (fica no PDV, aviso
"Venda #7 registrada com sucesso", link de imprimir). Cancelada logo em
seguida (motivo registrado), usando o cliente já existente "João da Silva
Teste" para receber o crédito, evitando afetar cliente real. Conferido no
banco depois: estoque do produto voltou pra 10, venda marcada `CANCELLED`
com o motivo, crédito de R$7,00 só na conta de teste — nada real foi
afetado.

## 2026-08-11 — Reset de vendas/pedidos/caixa para testes práticos + bug do Prisma em scripts

**Pedido do usuário:** zerar a movimentação da loja real (EficazBr Eletrônicos)
para começar testes práticos "do zero" no dia seguinte — cancelar todos os
pedidos do catálogo online, apagar todo o histórico de vendas e zerar o
crédito de loja do cliente `@eficazbr`. Confirmado com o usuário (várias
rodadas de pergunta) que era para valer em **produção**, com backup antes, e
que o escopo se estendia a: caixa (aberturas/fechamentos), fiado e crédito de
*todos* os clientes (não só `@eficazbr`), devolução do estoque das vendas/pedidos
desfeitos, e reset da numeração sequencial de venda/pedido para 0.

**Descoberta importante — Prisma Client quebrado em scripts standalone:**
qualquer script rodado via `npx tsx scripts/*.mts` (inclusive `limpar-dados-demo.mts`,
código já existente, não relacionado a esta mudança) falha com `ECONNREFUSED`
em **qualquer** query, mesmo `select 1`. Isolado com debug (`DEBUG=prisma:*`):
o Prisma Client (`@prisma/adapter-pg` + gerador `prisma-client`, ambos 7.9.1)
reporta `ECONNREFUSED` mesmo passando pelo `Pool` do `pg` correto — mas uma
conexão `pg` crua, com a mesma `DATABASE_URL` e até a mesma query SQL gerada
pelo Prisma, funciona perfeitamente. Não é a sandbox (testado com
`dangerouslyDisableSandbox`), não é a connection string, não é lógica do
script. Suspeita: incompatibilidade entre o gerador `prisma-client`/`adapter-pg`
7.9.1 e Node v24.18.1 (versão recente) neste ambiente. **Não corrigido** —
afeta todos os scripts de manutenção existentes (`limpar-dados-demo.mts`,
`limpar-sessoes-expiradas.mts` etc.), não só os novos. Vale investigar numa
sessão futura (checar changelog do Prisma/adapter-pg para Node 24, ou tentar
Node 22 LTS como teste).

**O que mudou:**
1. Criado `scripts/reset-vendas-pedidos.mts` — usa `pg` diretamente (SQL puro
   parametrizado), contornando o bug acima. Modo dry-run por padrão, exige
   `--confirmar` para executar. Filtra pelo tenant `subdomain = "eficazbr"`
   (o banco tem também um tenant de teste, `Teste123`, que existe tanto em
   `dev-local` quanto em produção — não tocado, por pedido explícito do
   usuário). Replica exatamente a lógica de estorno de estoque de
   `cancelSale`/`revertStockDeduction` (`sale-service.ts`/`order-service.ts`).
   Não commitado (arquivo novo, só commitar se o usuário pedir).
2. **Backup de produção:** branch Neon `backup-antes-reset-vendas-20260811`
   (`br-autumn-forest-acls1ei4`), criado a partir da branch de produção
   (`br-super-breeze-accw4gep`) no estado exato anterior ao reset — permite
   restaurar se precisar consultar algo do histórico apagado.
3. **Reset executado em produção** (tenant EficazBr Eletrônicos): 17 pedidos
   marcados `CANCELLED` (6 já estavam, 11 `NEW`), 11 vendas apagadas (6
   concluídas — estoque de 6 produtos devolvido), 2 caixas apagados, 3
   movimentações de crédito apagadas, saldo de crédito e total gasto zerados
   para todos os clientes (o cliente `@eficazbr` tinha saldo > 0, confirmado
   zerado depois), numeração de venda e pedido reiniciada para 0.

**Testado:** script validado com dry-run e depois `--confirmar` completo no
banco `dev-local` primeiro (mesmo tenant `eficazbr`, dados equivalentes)
antes de tocar em produção — conferido depois: vendas=0, pedidos todos
`CANCELLED`, caixas=0, nenhum cliente com crédito residual, sequências
zeradas. Repetido o mesmo dry-run em produção (números conferidos com o
usuário antes de rodar) e depois o `--confirmar` real, com verificação final
direta no banco de produção confirmando o mesmo resultado, incluindo
`creditBalance`/`totalSpent` do cliente `@eficazbr` em `0.00`.

**Pendência:** o bug do Prisma Client em scripts standalone (acima) continua
sem correção — os scripts de manutenção antigos (`limpar-dados-demo.mts` etc.)
também estão quebrados até isso ser investigado. `dev-local` do tenant
`eficazbr` também ficou com vendas/pedidos/caixa zerados como efeito colateral
de validar o script lá antes de produção (branch de desenvolvimento,
descartável, sem impacto).

**Não commitado** (nem o script novo, nem este relatório) — mudança foi só em
dado de produção via script, nenhum arquivo de código do app foi alterado.

## 2026-08-11 — E-mail transacional, cupom de venda, Ponto multiusuário e cadastro de cliente

**O que mudou:**
1. **E-mail transacional (Resend):** domínio `eficazbr.com.br` já estava
   verificado (DKIM/SPF); atualizada a variável `EMAIL_FROM` em produção na
   Vercel para `Eficaz Gestão <naoresponda@eficazbr.com.br>` (era o endereço
   sandbox `onboarding@resend.dev`, que só envia pro próprio dono da conta —
   causa do erro visto no início da sessão). Redeploy pra aplicar a variável.
   Testado com um envio real (script temporário, removido depois) — chegou
   certo na caixa de entrada.
2. **Bug corrigido — preço da variante "Ventosa Traseira":** o catálogo
   mostrava R$ 24,00 (dupla face ou adesivo) em vez de R$ 12,00 — o preço
   base do produto (R$ 12) já cobria a opção, mas cada variante também tinha
   `priceAdjustment` de +R$ 12, somando os dois. Corrigido diretamente no
   banco de produção (zerado o `priceAdjustment` das duas variantes,
   confirmado antes/depois) — não foi bug de código, foi dado cadastrado
   errado. Sem commit (não mexeu em código).
3. **Bug corrigido — corte na borda direita do cupom impresso:** a impressora
   térmica real é uma Epson TM-T20X-II (80mm, área imprimível de 72mm), mas o
   CSS de impressão (`src/app/globals.css`) usava 74mm de conteúdo — um fix
   anterior (06/08) tinha corrigido o empurrão do padding do painel mas
   superestimado a largura útil. Ajustado para 72mm, mantendo a centralização
   já validada. Commit `e5313c8`.
4. **Cupom de venda:** removido o rodapé "Documento sem valor fiscal ·
   Obrigado pela preferência!"; adicionado o site da loja
   (`www.eficazbr.com.br`, calculado por tenant via `storeOrigin`/novo
   `storeDisplayHost`, não fixo) e um QR code (nova dependência `qrcode`, SVG
   gerado no servidor) apontando pra home da loja, logo abaixo do telefone no
   cabeçalho (`src/app/(admin)/vendas/[id]/page.tsx`). Commit `483a64d`.
5. **Controle de Ponto — seleção de colaborador:** o caixa é compartilhado
   por até 3 colaboradores numa sessão só; agora bater entrada/saída/intervalo
   exige escolher o nome numa lista de colaboradores ativos do tenant antes de
   ver a próxima marcação ou registrar — antes usava sempre o usuário logado.
   Selfie continua obrigatória como já era; a marcação grava no colaborador
   selecionado. Reescrito `src/app/(admin)/ponto/clock-widget.tsx` +
   `page.tsx`, nova action `getPunchStatusAction` e validação do colaborador
   selecionado em `punchAttendanceAction` (`src/app/(admin)/ponto/actions.ts`).
   Commit `3fd65f8`.
6. **Cadastro de cliente na loja online:** CPF e data de nascimento passaram a
   obrigatórios nos dois fluxos de autocadastro do cliente — checkout ("Criar
   conta") e botão "Cadastrar" do cabeçalho (`checkout-form.tsx`,
   `conta/entrar/auth-form.tsx`, `src/lib/validations/order.ts`,
   `src/lib/validations/customer-auth.ts`, `src/modules/customers/customer-service.ts`).
   WhatsApp e `@usuário` já eram obrigatórios, endereço continua opcional.
   Cadastro manual pelo lojista no painel (venda presencial) não foi tocado —
   confirmado com o usuário que a exigência é só do lado do cliente na loja
   online. Commit `3fd65f8` (mesmo commit do item 5).

**Testado:** lint/typecheck/build sem erros nem warnings novos em cada
mudança de código; suíte Vitest completa (82 testes) passando. Deploy de
produção confirmado via `check:deploy` (Vercel + páginas públicas + rota
`comprar-whatsapp` + logs) depois de cada leva de commits. Ponto e cadastro
de cliente também testados manualmente pelo usuário em produção — confirmou
que os dois funcionaram perfeitamente (seleção de colaborador e
obrigatoriedade de CPF/data de nascimento/@usuário). O cupom recebeu duas
rodadas de teste físico de impressão pelo usuário (foto do cupom antes/depois
da correção de largura).

**Tudo commitado e em produção** (commits `e5313c8`, `483a64d`, `3fd65f8`),
working tree limpo (só `.codex/` não rastreado e este próprio relatório, sem
relação direta com o código desta sessão).

## 2026-08-10 — Login por e-mail único + correção da câmera no Controle de Ponto

**O que mudou:**
1. Login substituído por fluxo de duas etapas: e-mail único da empresa
   (`Tenant.email`, novo) identifica o tenant, depois o colaborador escolhe o
   próprio nome numa lista e digita só a senha (`User.email` virou opcional).
   Reaproveita o fluxo existente de "dispositivo lembrado". Migration com
   backfill automático (e-mail do primeiro ADMIN de cada tenant vira
   `Tenant.email`) — nenhum tenant existente perde acesso. Commit `c3a528d`.
2. Ajuste no `scripts/scan-secrets.mts` para reduzir falsos positivos
   (`NEXTAUTH_URL`, `EMAIL_FROM`, referências de propriedade tipo
   `parsed.data.password`). Commit `b6fcb38`.
3. **Bug corrigido:** preview da câmera no Controle de Ponto
   (`src/components/ui/selfie-capture-field.tsx`) ficava com a tela preta
   mesmo com a permissão da câmera concedida. Causa: o `srcObject` do stream
   era atribuído dentro do `.then()` do `getUserMedia`, mas o `<video>` só
   existe no DOM quando `mode === "live"` — nesse momento o ref ainda era
   `null`, então o stream nunca chegava a ser conectado ao elemento. Corrigido
   movendo a atribuição para um `useEffect` disparado quando `mode` muda para
   `"live"`, depois que o `<video>` já montou. Commit `b168458`.

**Testado:** os três commits foram enviados e o deploy de produção
confirmado (`npx vercel inspect`). O fluxo de login foi validado manualmente
com o usuário "EficazBr Gestão" em `app.eficazbr.com.br`. A correção da
câmera foi validada com uma página de debug temporária local
(`/debug-selfie`, criada e removida na mesma sessão, sem tocar em senha de
usuário) e depois confirmada end-to-end em produção: câmera ao vivo, captura
nítida, upload da selfie e "Entrada registrada com sucesso".

**Observação:** durante o diagnóstico, um teste inicial ficou preso porque a
webcam física estava em uso por outra aba/stream ainda aberta — não é bug de
código, é limitação normal de webcams USB (um único acesso por vez).

4. **Nova funcionalidade:** relatório de Faturamento/Gastos/Lucro por período
   na Assistência Técnica (`src/app/(admin)/assistencia-tecnica/page.tsx`),
   visível só para Administrador (mesma regra de `costPrice`, que já era
   restrito a ADMIN). Filtro De/Até + atalhos (Hoje, Ontem, Últimos 7/30 dias,
   Este mês) reaproveitando o `PeriodPicker` já usado em Relatórios > Caixa
   (`src/app/(admin)/relatorios/report-nav.tsx`, que ganhou um prop
   `extraParams` opcional pra não perder a busca ao trocar o período, e
   vice-versa). Faturamento = soma dos itens menos desconto das OS's do
   período (exceto canceladas); Gastos = soma do `costPrice`; Lucro = a
   diferença. Commit `e0baa9a`.

**Testado (item 4):** validado com uma página de debug temporária local
(`/debug-assistencia`, criada e removida na mesma sessão, sem login) contra
dados reais do banco `dev-local` — números batendo à mão, troca de período e
busca preservando um ao outro sem se atropelar. Lint/typecheck/build sem
erros nem warnings novos. Deploy de produção confirmado via `vercel inspect`.

**Tudo commitado e em produção** (commits `c3a528d`, `b6fcb38`, `b168458`,
`e0baa9a`), working tree limpo (só `.codex/` não rastreado, sem relação com
esta sessão).

## 2026-08-09 — Controle de Ponto (selfie) + Vendedor obrigatório no PDV

**O que mudou:** novo módulo de Controle de Ponto (marcação com selfie, correção
auditável, painel administrativo) e exigência de seleção explícita de vendedor
antes do pagamento no PDV (separado de quem opera o caixa).

**Arquivos criados:**
- `src/modules/attendance/attendance-rules.ts` (+ `.test.ts`) — lógica pura (próxima marcação esperada, resolução de correções, horas trabalhadas).
- `src/modules/attendance/attendance-service.ts` — camada Prisma do módulo de ponto.
- `src/modules/sales/seller-eligibility.ts` (+ `.test.ts`) — validação pura de elegibilidade de vendedor.
- `src/lib/validations/attendance.ts` — schemas Zod de ponto.
- `src/app/api/ponto/upload/route.ts` — upload de selfie (Vercel Blob).
- `src/components/ui/selfie-capture-field.tsx` — captura de câmera com fallback gracioso.
- `src/app/(admin)/ponto/**` — bater ponto, histórico próprio, painel administrativo, correção por colaborador.
- `src/app/(admin)/pdv/seller-picker-modal.tsx` — seleção de vendedor no PDV.

**Arquivos modificados:** `prisma/schema.prisma` (models `AttendanceEntry`,
`AttendanceCorrection`, `Sale.assistantSellerId`, `Tenant.attendanceSettings`),
`src/lib/permissions.ts`, `src/modules/audit/audit-service.ts`, `src/proxy.ts`,
`src/components/admin/nav-items.ts`, `src/lib/validations/sale.ts`,
`src/modules/sales/sale-service.ts`, `src/app/(admin)/pdv/actions.ts`,
`src/app/(admin)/pdv/pdv-screen.tsx`, `scripts/seed-demo.mts`.

**Migration:** `20260809165538_add_attendance_tracking_and_sale_assistant_seller`
— 100% aditiva (2 tabelas + 1 enum novos, 2 colunas opcionais em tabelas
existentes). Aplicada em `dev-local`, não em produção.

**Testes:** 82 testes Vitest passando (12 novos). `lint`/`typecheck`/`build`
completo sem erros nem warnings novos. Testado manualmente no navegador contra
o banco `dev-local`: fluxo de venda com vendedor diferente do operador do
caixa (confirmado no relatório "Por vendedor"), fallback de câmera, registro
de ponto sem selfie com auditoria, painel de ponto, correção de marcação com
trilha de auditoria completa.

**Pendência:** ficou uma venda de teste (#10, R$ 30,00, "Vendedor teste") no
banco `dev-local` do tenant EficazBr — não cancelada de propósito para não
gerar crédito de loja indevido a um cliente real. Cancelar manualmente se
quiser remover, ou deixar como está (não afeta produção).

**Nada foi commitado** — mudanças ficaram no working tree, aguardando revisão do usuário.
