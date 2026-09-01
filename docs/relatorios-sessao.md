# Relatórios de sessão

## 2026-08-26 — Sangria/Suprimento com foto do comprovante, direto no PDV

Pedido do usuário: no PDV, um jeito de colocar dinheiro no caixa
(suprimento) ou dar saída (sangria) quando compram algo com o dinheiro da
gaveta, com foto do comprovante/nota da compra. Já existia o modelo
`CashMovement` (sangria/suprimento) e o formulário correspondente, mas só
dentro de `/caixa` — não no PDV — e sem campo de foto.

Expliquei o plano (schema novo campo + migration, formulário com foto,
botão no PDV, exibir a foto no histórico) e pedi confirmação antes de
mexer no schema, por ser mudança de banco — usuário aprovou.

**Schema:** `CashMovement.receiptPhotoUrl` (opcional). A migration via
`prisma migrate dev` pediu reset do banco de dev por causa de um drift de
checksum num migration antigo não relacionado (`pdv_ranking_enabled_default_on`,
provavelmente diferença de fim de linha do Windows/git — `migrate status`
não acusava nada de errado) — não segui o reset (perderia dados de teste
locais), criei a migration manualmente e apliquei com `prisma migrate
deploy`, que não usa shadow database e não é afetado por esse drift.

**Formulário** (`cash-forms.tsx`, `CashMovementForm`): campo de foto
opcional (`ImageUploadField`, mesmo endpoint `/api/caixa/upload` já usado
pelas fotos de comprovante da maquininha), texto do motivo adaptado ao
tipo (compra vs. depósito). Troquei `watch()` por `useWatch({ control })`
pra não introduzir o warning de "incompatible library" do React Compiler
(mesmo padrão já usado em `FinalizeReviewForm`).

**PDV:** novo card "Caixa" com botão "Sangria / Suprimento" que abre um
modal (`cash-movement-modal.tsx`) com o mesmo formulário, visível só pra
quem já pode mover caixa (`canMoveCash` — Admin/Gerente); fecha sozinho
ao registrar com sucesso.

**Histórico** (`/caixa`): link "Ver foto do comprovante" na lista de
movimentações, quando houver foto.

Testado ao vivo no PDV: registrei uma sangria de teste (R$10, sem foto),
confirmei que o modal fechou sozinho, que "Esperado na gaveta" em
`/caixa` refletiu a subtração e que a movimentação apareceu no
histórico — depois removi esse registro de teste do banco. `lint` (0
warnings novos), `typecheck` e `build` (com a migration) passando.

## 2026-08-26 — Ranking do PDV mostrando só quem vendeu no dia; contraste em dois campos de busca

**Ranking de Comissão no rodapé do PDV.** O usuário reportou (foto da
tela) que só a Sofia aparecia no rodapé, quando deveria aparecer todo
mundo que vendeu no mês. Causa: `src/app/(admin)/pdv/page.tsx` já tinha
uma correção pronta só localmente, nunca commitada nem enviada — trocava
o período de "só hoje" pra "dia 1 do mês até hoje" (rótulo também
corrigido, de "— hoje" pra "de venda do mês"). Commitei e enviei essa
mudança que já estava pronta; conferido em produção com
`check:deploy` (tudo OK, deploy Ready).

**Contraste em dois campos de busca.** A partir de um vídeo do usuário
mostrando o campo de busca da tela de Clientes com "letra preta em fundo
preto", achei a causa: `<input>` puro sem nenhuma classe de cor de fundo
ou texto — o mesmo padrão de bug já corrigido antes em outros campos (a
regra em `globals.css` só cobre a cor do texto do "padrão de fábrica",
não o fundo). Corrigido lá e, achando o mesmo padrão exato num segundo
lugar (busca de produto na Conferência de Estoque do Colaborador),
perguntei e corrigi os dois juntos — fundo e texto explícitos, mesmo
padrão do resto da tela. Commitado e enviado, conferido em produção com
`check:deploy`.

`lint`/`typecheck`/`build:app` passando nas duas entregas antes do push.

## 2026-08-26 — Diagnóstico de diferenças no caixa, edição de caixa fechado e logout automático

Pedido do usuário, em três partes, a partir de uma dúvida real dele sobre
um fechamento específico (foto da tela: -R$269,99 em dinheiro, -R$111,60
em Pix).

**(a) Diagnóstico de diferenças.** Investiguei o caso concreto primeiro:
os dois valores são negativos (falta nas duas formas), então
matematicamente não se cancelam como "troca entre formas" — isso exigiria
sobra numa forma pra compensar falta na outra. Mostrei ao usuário que o
cenário que bate exatamente é uma venda de ~R$111,60 paga em dinheiro mas
lançada como Pix no sistema (explica 100% da diferença do Pix) — o que
revela que a falta real em dinheiro não é R$269,99, e sim R$381,59
(269,99 + 111,60), já que parte dela estava mascarada por esse erro de
lançamento. Depois de validar o racional com o usuário, implementei o
cálculo (`src/lib/cash-diagnosis.ts`: cruza sobra numa forma com falta em
outra, pareamento guloso pelo maior valor primeiro) e um card
"Diagnóstico de diferenças" (`src/components/cash-diagnosis-card.tsx`)
que aparece na revisão/histórico do caixa mostrando o que pode ser
troca entre formas e o que sobra como falta/sobra real — sem mudar nada
no schema.

**(b) Ver e editar caixa já fechado.** O histórico só linkava pra dentro
de um caixa `PENDING_REVIEW` ("Revisar"); um caixa `CLOSED` não tinha
link nenhum pra ver detalhes — corrigido em
`caixa/historico/page.tsx`. Perguntei ao usuário o desenho antes de
mexer em registro financeiro fechado: só ADMIN edita (mesmo padrão de
`canEditSale`), os campos editáveis são os "conferido" de cada forma
(dinheiro/débito/crédito/Pix) e observações — o "esperado" continua
calculado pelo sistema, não editável — e cada edição vira uma linha
automática nas próprias Observações ("Editado por {admin} em {data}:
campo X → Y"), sem tabela de auditoria nova. Novo componente
`ClosedRegisterPanel` (`caixa/cash-forms.tsx`) alterna entre visão
(cartões + diagnóstico) e formulário de edição (mesmo diagnóstico
recalculando ao vivo enquanto o Admin digita a correção), nova action
`editCashRegisterAction` + `editClosedCashRegister` no `cash-service`.

**(c) Logout automático ao fechar o caixa.** Terminal de PDV é
compartilhado entre turnos — pedido do usuário pra evitar o próximo
colaborador usar sem querer a sessão de quem acabou de fechar. Adicionado
`await signOut({ redirectTo: "/login" })` ao fim de
`closeCashRegisterAction` (fechamento direto por Admin/Gerente) e de
`submitCashRegisterForReviewAction` (envio às cegas pelo Vendedor) — as
duas ações que marcam o fim do uso do terminal por quem estava logado.
Não mexi em `finalizeCashRegisterReviewAction`: é o Admin revisando à
distância, não necessariamente no terminal físico.

**(d) Os três horários do ciclo de fechamento, visíveis.** Pedido
posterior do usuário: registrar bem a hora de abertura (já existia), a
hora que o colaborador fechou/enviou pra revisão e a hora que o Admin
finaliza. Os dois primeiros já existiam no banco (`openedAt`,
`reviewSubmittedAt`) mas o do meio não aparecia em lugar nenhum da UI —
acrescentada a coluna "Enviado p/ revisão" na lista do histórico e a
data/hora ao lado de "contagem enviada por" no detalhe do caixa.

`lint`/`typecheck`/`build:app` passando em cada etapa (0 erros; os 9
warnings pré-existentes de `watch()` do react-hook-form em outros
formulários não mudaram). Não consegui testar ao vivo logado (sem acesso
de rede ao Neon `dev-local` a partir deste ambiente pra popular/consultar
dados de teste) — só verifiquei que as rotas não quebram (redirecionam
pra `/login` sem sessão, sem erro 500) com o servidor de dev local
rodando. As quatro partes ((a)-(d)) foram commitadas juntas (mesmos
arquivos entrelaçados) e enviadas para produção depois de confirmação do
usuário; `check:deploy` OK depois do deploy. Recomendo o usuário conferir
manualmente na prática, em especial o fluxo de edição de caixa fechado e
o logout automático nos dois pontos de fechamento.

## 2026-08-25 — Ranking de Comissão permanente no rodapé do PDV; remove "Minha Comissão"

Pedido a partir de um print da tela "Minha Comissão" (individual, por
colaborador) — esclarecido por perguntas até ficar claro que era outra
coisa: confusão entre essa tela pré-existente e o Ranking de Comissão no
rodapé do PDV (feature da sessão anterior, 2026-08-25 mais cedo, commit
`1b05a0f`). O usuário achou que o ranking estava "vazando" mesmo com o
toggle desligado — na real quem aparecia era a tela individual, sem
relação nenhuma com o toggle.

**1. Removida a tela/menu "Minha Comissão".** Item de navegação (só
visível pro papel `SELLER`) e a rota de atalho `/minha-comissao` (que só
redirecionava pra `/colaboradores/[userId]/comissao`) foram apagados. A
rota `/colaboradores/[userId]/comissao` continua existindo — é usada por
Admin/Gerente pra ver a comissão de qualquer colaborador (link no Ranking
de Comissão e em Colaboradores).

**2. Ranking no rodapé do PDV virou permanente por padrão**, visível pra
qualquer conta que opera o caixa (Admin/Gerente/Vendedor), não mais
desligado por padrão. `Tenant.pdvRankingEnabled` mudou o `@default` de
`false` pra `true` (migration `20260825203921_pdv_ranking_enabled_default_on`,
que também fez `UPDATE` nos tenants já existentes — 4 no dev-local,
incluindo produção depois do deploy). O botão em "Ranking de Comissão"
continua o mesmo, só que agora funciona como interruptor pro Admin
desligar temporariamente (e religar depois), não mais como "ligar".

**Testado:** `lint` (só os 9 warnings pré-existentes, não relacionados),
`typecheck` e `build:app` limpos. `check:deploy` OK depois do push (deploy
Ready, páginas públicas, `comprar-whatsapp` redirecionando, sem erros nos
logs). Commit: `42156e6`.

## 2026-08-20 — Botão "Corrigir câmera" no Ponto e leitor de código de barras também na busca de Produtos

Continuação da sessão anterior (leitor de câmera/QR criado em 2026-08-19).

**1. Bug real reportado com print: câmera do Ponto não abria no PC/PDV da
loja.** Investigação por perguntas (o que aparece na tela, em qual
aparelho) até o usuário confirmar: a câmera funciona normalmente nesse PC,
só não abre dentro do app — sintoma clássico de permissão bloqueada só
pro site no navegador (comum quando alguém clicou "Bloquear" na primeira
vez que o Chrome pediu acesso). Resolvido manualmente pelo usuário
liberando a permissão do site nas configurações do Chrome; confirmado
"Deu certo".

**2. Botão "Corrigir câmera" com diagnóstico automático.** Pedido do
usuário antes de saber a causa do bug acima: em vez de precisar pedir pra
mim resolver toda vez, um botão que já tenta corrigir sozinho. Adicionado
em `selfie-capture-field.tsx` (usado no Ponto, Convênios e Proteção
Eficaz): ao ser clicado, checa a permissão de câmera via Permissions API
(quando o navegador suporta), verifica se existe alguma câmera no
aparelho, e tenta abrir de novo (frontal primeiro, sem restrição depois,
cobrindo webcam de PC). Quando o problema é algo que o código consegue
resolver, a câmera já abre ao vivo na hora; quando é bloqueio explícito
do navegador ou nenhuma câmera encontrada — coisa que nenhum site
consegue reverter via código, só o usuário —, mostra a mensagem exata do
que fazer (ex.: "toque no ícone de cadeado ao lado do endereço e permita
a câmera"). Deploy publicado antes da confirmação do usuário nesse PC;
teria detectado o caso dele ("permissão bloqueada") caso ele tivesse
testado o botão em vez de resolver direto nas configurações do Chrome.

**3. Leitor de câmera/QR também na busca de Produtos.** Pedido de
seguimento: o mesmo botão "Escanear" do cadastro (2026-08-19), agora
também ao lado do campo de busca na listagem de Produtos
(`produtos-filtros.tsx`) — escaneia o código de barras e já filtra a
lista (`onScanned` chama `updateParams({ q: valor })` direto, sem esperar
o debounce normal da digitação).

**Testado:** `lint`, `typecheck` e `build:app` limpos em cada etapa
(mesmos warnings pré-existentes de sempre, não relacionados).
`check:deploy` OK depois de cada push. Commits: `dcf0592` (botão
"Corrigir câmera"), `0990fcb` (escanear na busca de Produtos).

## 2026-08-19 — Produtos: leitor de câmera/QR e código interno; cupom de venda com iniciais do vendedor

Pedido do usuário, sem apontar de início qual tela ("preciso, no cadastro,
de uma câmera ou leitor de QR") — esclarecido por pergunta: cadastro de
Produtos, pra preencher o campo "Código de barras / EAN".

**1. Leitor de câmera/QR no cadastro de produtos.** Novo componente
`BarcodeScannerField` (`src/components/ui/barcode-scanner-field.tsx`): botão
"Escanear" ao lado do campo de código de barras abre a câmera traseira
(quando existir) num modal e lê o código ao vivo, preenchendo o campo sem
digitar. Primeira versão usou o `BarcodeDetector` nativo do navegador — sem
lib extra, mesmo padrão de fallback gracioso já usado em
`selfie-capture-field.tsx`. **Bug reportado pelo usuário** (com print):
no Chrome do iPhone aparecia sempre "navegador não suportado". Causa: no
iOS, todo navegador — inclusive o "Chrome" — roda sobre o motor WebKit da
Apple (política da App Store), e o WebKit não implementa a API nativa de
leitura de código de barras; só Chrome/Edge com engine Blink (desktop e
Android) têm. Corrigido trocando a API nativa pelo pacote `barcode-detector`
(decodifica via WebAssembly, `zxing-wasm`), que funciona igual em qualquer
navegador — só depende da câmera (`getUserMedia`), aí sim praticamente
universal. Removido o arquivo de tipos ambientes que só existia pra suprir
o `window.BarcodeDetector` nativo.

**2. Gerar código interno automaticamente.** Pedido complementar, no meio
da mesma tarefa: opção pra gerar um código interno pra produtos sem EAN do
fabricante, pra etiquetar e escanear depois. Nova action
`generateInternalCodeAction` em `produtos/actions.ts` gera código
sequencial único por tenant (`INT-000001`, `INT-000002`, ...), com botão
"Gerar" ao lado do campo.

**3. Cupom de venda: vendedor por iniciais, não nome completo.** Terceiro
pedido, também mid-turn: no cupom impresso/emitido pro cliente
(`vendas/[id]/page.tsx`), o campo "Vendedor" mostrava o nome completo —
trocado pra iniciais (ex.: "JS"), pra não expor o nome completo do
funcionário no comprovante que fica com o cliente. A função de iniciais já
existia (só local, em `seller-picker-modal.tsx`, pro seletor de vendedor do
PDV) — extraída pra `lib/format.ts` (`nameInitials`) e reaproveitada nos
dois lugares. O seletor do PDV continua mostrando o nome completo (tela
interna do operador, não o cupom do cliente).

**Testado:** `lint`, `typecheck` e `build:app` limpos em cada etapa (sem
warnings novos além dos pré-existentes de `react-hooks/incompatible-library`
já presentes no projeto, não relacionados). `check:deploy` OK depois de
cada push. Usuário testou ao vivo o leitor no Chrome do iPhone depois do
deploy da correção do WASM e confirmou que ficou funcionando. Commits:
`d79cdaf` (leitor + código interno), `d71405d` (iniciais no cupom),
`38b7a2e` (troca pra polyfill WASM, corrigindo o bug do iPhone) — só esses
arquivos entraram nos commits; as demais alterações já pendentes no
repositório antes desta sessão (garantia/assistência técnica, scripts de
QA, docs de auditoria) ficaram de fora, por não fazerem parte deste
pedido.

## 2026-08-18 — Colaboradores: confirmação de pagamento por selfie e lançamento livre

Ideia trazida pelo usuário a partir de um pagamento real (Sofia Freelance,
R$142,20 de horas): hoje só o Admin/Gerente marca um lançamento como
"pago" em Colaboradores, sem nenhum registro de que o colaborador de fato
recebeu. Duas perguntas de escopo antes de implementar (ambas com a opção
recomendada escolhida): manter o botão manual "Marcar como pago" como
alternativa (não substituir por selfie obrigatória), e incluir também um
tipo de lançamento livre pra valores avulsos (vale-transporte, comissão
relâmpago) — as duas confirmadas.

**Confirmação por selfie:** o colaborador entra no Ponto (mesmo picker
"selecione quem está batendo o ponto", único login compartilhado), e se
tiver algum lançamento pendente aparece "Pagamentos pendentes" com um botão
"Confirmar recebimento" que abre a mesma captura de selfie ao vivo já usada
pra bater ponto (`SelfieCaptureField`, sem opção de dispensar — aqui a foto
é o propósito, não uma formalidade). `EmployeeLedgerEntry` ganhou
`paidSelfieUrl` (nulo quando foi o Admin quem marcou manualmente); a lista
de lançamentos em Colaboradores mostra "ver selfie" só nesses casos.

**Lançamento livre:** novo tipo `OTHER` ("Outro (lançamento livre)") no
enum `EmployeeLedgerType`, com descrição obrigatória (antes só existia
Adiantamento, Compra de mercadoria e Pagamento por horas). Resumo por
colaborador (`getEmployeeLedgerSummary`) ganhou o bucket `otherPending`
separado — sem isso, cairia por engano no total de "Pagamento por hora".

**Testado:** `lint`, `typecheck`, os 110 testes automatizados e `npm run
build` completo (migration: novo valor de enum + coluna nova, ambos sem
risco de perda de dado) sem erros nem warnings novos. Ponta a ponta em
`dev-local` com admin e colaborador descartáveis (`qatmp_ledger_*`,
apagados depois): lançamento "Outro" criado pelo Admin apareceu certo no
card e na tabela; "Marcar como pago" manual continua funcionando sem
selfie; confirmação por selfie no Ponto (fallback de arquivo, sem câmera
real disponível no ambiente de teste) quitou o lançamento e a tabela
passou a mostrar "Pago · ver selfie" só nesse. Commit `eb6f771`, deploy
manual via `vercel --prod` (auto-deploy via push não disparou a tempo de
novo) e `check:deploy` OK.

**Confirmação ponta a ponta em produção real** (a pedido do usuário, feito
depois do teste em `dev-local` acima): logada como Admin real no navegador
do usuário, criei um lançamento "Outro" de R$0,01 pra ela mesma ("Teste QA
- ignorar, sem valor real"), confirmei com selfie pelo Ponto e vi "Pago ·
ver selfie" aparecer certo em Colaboradores. Depois de rodar
`npm run typecheck`, o usuário mesmo apagou o lançamento de teste em
produção via SQL preparado por mim (SELECT de conferência + DELETE por
`description`, rodado por ele no console do Neon — nunca acesso direto
deste agente ao banco de produção); confirmei visualmente depois que sumiu
e que o total pendente voltou a R$603,80.

**Observação separada, mesmo dia:** "Comissão de venda" e "Pagamento por
horas" em Colaboradores abriam em aba nova sem necessidade (o layout do
painel já mantém o menu lateral fixo fora das páginas — `(admin)/layout.tsx`
— navegação normal só troca o quadro central). Removido `target="_blank"`
dos dois (commit `8fcd2da`) e, numa varredura seguinte, do terceiro link
que tinha ficado de fora ("Selecionar produtos comissionados", commit
`0da7ac2`). Deliberadamente **não** mexi nos outros `target="_blank"` do
projeto (WhatsApp/Instagram, impressão de comprovante/cupom no PDV e na OS,
visualização de selfie/foto de comprovante, "Cadastre aqui" cliente durante
uma venda) — mudar esses pra mesma aba faria perder o carrinho/venda em
andamento ou navegar pra fora do sistema. Ambos os commits com
`lint`/`typecheck`/110 testes limpos, deploy via `vercel --prod` e
`check:deploy` OK.

## 2026-08-17 — Bug de numeração de pedido, busca do PDV, resgate da Proteção Eficaz no PDV e extrapolação de dia incompleto no Ponto

**1. Produção — "Comprar pelo WhatsApp" falhando com erro de número
duplicado.** Logs de `check:deploy` mostravam `Unique constraint failed on
(tenantId, number)` toda vez que um pedido novo era criado.
`scripts/reset-vendas-pedidos.mts` zerava `orderSequence` junto com
`saleSequence`, mas `Order` é cancelado (nunca apagado) — o contador voltava
pra 0 e colidia com o número de um pedido cancelado que ainda existe na
tabela. Corrigido o script (só `saleSequence` é zerado, com comentário
explicando por quê) e resincronizado o contador de produção via `UPDATE
tenants SET "orderSequence" = MAX(number)` — SQL passado pro usuário rodar
direto no console do Neon (nunca conexão direta deste agente com produção).
Confirmado com um pedido real de teste (`#21`). Commit `da519b2`.

**2. Busca de produto no PDV incompleta.** Dois problemas relatados: (a)
limite fixo de 15 resultados sem nenhum aviso, escondendo produtos (ex.:
249 produtos batem "Película 3D"); (b) busca por frase única (`contains`)
não achava "13 pró" numa capinha chamada "Capa MAGNETIC - IP - 13 PRO"
(ordem/prefixo diferente). Corrigido: `take` subiu para 30 + contagem total
exibida ("Mostrando X de Y — digite mais pra refinar"), e a busca virou
AND por palavra (cada palavra do termo tem que aparecer em nome/código/
código de barras, em qualquer ordem). Testado em `dev-local` e, só a busca
(sem tocar carrinho/finalizar), direto no PDV real de produção.

**3. Resgate da Proteção Eficaz sem jeito de acionar no PDV.** O fluxo de
aprovação (cliente registra a nota, Admin aprova) já existia, mas não havia
nenhum jeito de aplicar o desconto na hora de vender a película de troca.
Adicionado modal "Validar troca — Proteção Eficaz" no PDV (mesmo padrão do
QR de Convênio): vendedor digita o número da venda original, sistema
confirma cliente/validade e zera o preço da película (exige exatamente 1
película no carrinho). Efeito colateral necessário: passou a ser possível
fechar uma venda de R$0,00 (regra de "precisa de pagamento" saiu do schema
Zod e virou checagem em `sale-service.ts`, condicionada a `total > 0`).

**4. Ponto — histórico "Maiza" com valores impossíveis (ex.: "122h
43min").** Causa raiz: `computeWorkedMinutes` extrapola até "agora" quando
falta bater a saída — certo pra hoje (turno em andamento), errado pra um
dia passado (marcação simplesmente esquecida) porque soma dias inteiros de
diferença como se fossem horas trabalhadas naquele único dia. Corrigido
primeiro isolado em `hourly-payment-service.ts` (commit `ea12bfa`, com
`hasIncompleteDays` bloqueando o registro de pagamento até corrigir),
depois generalizado num helper compartilhado `computeWorkedMinutesForDay`
em `attendance-rules.ts` e aplicado também em `/ponto/colaborador/[id]` e
`/ponto/historico`, que tinham o mesmo bug e ainda não tinham sido
corrigidos. Dia passado sem saída agora mostra "Falta bater saída —
corrigir no Ponto" em vez de um total inventado.

Pedido do usuário nessa mesma leva: além de corrigir uma marcação existente
(já dava pra fazer), dar um jeito de **adicionar** a marcação que nunca foi
batida, já sugerindo qual é a esperada. Adicionado botão "+ Adicionar
marcação faltando (<tipo sugerido>)" em cada dia incompleto do Ponto do
colaborador — sugestão calculada pelo ciclo Entrada → Intervalo → Retorno →
Saída (mesma lógica que já decidia a próxima marcação do dia atual), com
data/hora e motivo obrigatório. Cria uma `AttendanceEntry` nova (marcada
como sem selfie, com o motivo do lançamento manual) — diferente de
"Corrigir", que exige uma marcação existente pra apontar como origem.
Commit `de90fed`.

**Testado:** `lint`, `typecheck`, os 110 testes automatizados e `npm run
build:app` sem erros nem warnings novos. Reproduzido o bug e validado a
correção + a marcação adicionada ponta a ponta com usuário e admin
descartáveis (`qatmp_*`) criados e apagados em `dev-local`, incluindo
conferência de que o painel de Horas em Colaboradores (mesmo helper
compartilhado) recalculou certo depois do lançamento. Deploy do item 4
publicado e validado com `check:deploy` (todas as checagens OK).

**Correção urgente logo após o deploy do item 4:** usuário reportou em
produção que adicionar a marcação faltante do dia 15 dava "Esse dia já tem
uma marcação desse tipo" mesmo com o tipo certo. Causa: a checagem de
duplicata em `addMissingAttendanceEntry` calculava início/fim do dia com
`Date.setHours(0,0,0,0)`, que usa o fuso do **servidor** — em produção
(Vercel, UTC) isso desloca a janela e passou a incluir marcações do dia
seguinte no fuso da loja (America/Sao_Paulo); o "Saída/fim de expediente"
do dia 16 (20:05) caiu dentro da janela calculada pro dia 15 e foi
confundido com um conflito. Nunca reproduziu em `dev-local` porque esta
máquina já roda em `America/Sao_Paulo`. Corrigido trocando pro mesmo helper
com fuso fixo -03:00 (`todayISO`/`periodRange`) já usado no resto do módulo
de Ponto — confirmado matematicamente simulando o relógio do servidor em
UTC antes de subir. Commit `4832c5a`, deploy manual via `vercel --prod`
(o deploy automático via push não disparou a tempo) e `check:deploy` OK.

**Ainda pendente, pausado (não commitado):** "Acionar garantia" em
Assistência Técnica — nova OS vinculada à original quando um aparelho
entregue volta com defeito coberto. Schema já migrado em `dev-local`
(`RepairOrder.warrantyOriginalId`), serviço/validação/UI escritos mas ainda
sem `typecheck`/teste finais depois da última edição — interrompido pelo
bug do Ponto. Retomar só se o usuário confirmar que ainda quer.

## 2026-08-16 — Proteção Eficaz e correção da impressão automática do PDV

**Proteção Eficaz (novo módulo):** no PDV, ao vender capinha + película
juntas, o vendedor marca se o cliente aceitou o desconto da película ou
abriu mão dele em troca da Proteção Eficaz — garantia de trocar a
película em até 30 dias **da data da venda** (não da aprovação). Sai
marcado no cupom. O cliente cadastra a nota em `/conta` no site (número
da venda + foto da nota física + aceite dos termos, uso único por
nota); o cadastro fica pendente até o Admin aprovar manualmente,
comparando a foto com o rascunho da venda no sistema (itens, preço,
vendedor, se realmente tinha capinha+película, se o vendedor marcou no
PDV) — mesmo padrão de aprovação já usado em Convênios. Aprovar calcula
o prazo de 30 dias a partir da venda; "Marcar como trocado" trava o
registro contra reuso. Só vale pra vendas com capinha + qualquer
película do catálogo (não só as duas elegíveis ao desconto de
segurança do Vendedor).

- `prisma/schema.prisma`: `Sale.protecaoEficazOptedIn`, modelo novo
  `ProtecaoEficaz` (status PENDING/APPROVED/REJECTED, prazo, campos de
  troca).
- `src/modules/protecao-eficaz/` (novo): toda a lógica de
  submissão/aprovação/rejeição/troca e o cálculo do prazo.
- `src/app/(admin)/pdv/pdv-screen.tsx`: caixinha de opção quando o
  carrinho é elegível; `src/app/(admin)/vendas/[id]/page.tsx`: aviso no
  cupom.
- `src/app/loja/[subdomain]/conta/`: seção de cadastro/status pro
  cliente; upload da foto numa rota nova **dentro** de
  `/loja/[subdomain]/api/...` (não em `/api/...` solto) — descoberto
  durante o teste que a sessão do cliente é restrita a esse prefixo
  quando a loja é acessada sem subdomínio próprio, então uma rota fora
  dele nunca recebia o cookie.
- `src/app/(admin)/protecao-eficaz/` (novo): fila de aprovação do
  Admin, com o rascunho da venda lado a lado com a foto do cliente.

**Corrigido de quebra:** impressão automática do cupom no PDV parada de
funcionar (reportado pelo lojista). O disparo dependia do próprio
documento do iframe oculto se auto-imprimir ao montar — trocado para o
pai chamar `iframe.contentWindow.print()` só depois do `onLoad`,
padrão mais confiável entre navegadores. Removido `AutoPrint` (ficou
sem uso). **Não testado o diálogo de impressão em si** (ambiente de
teste não permite) — pendente de confirmação do lojista no uso real.

**Testado:** `lint`, `typecheck`, `test` (104 passando) e `build`
(schema mudou) limpos. Fluxo completo verificado manualmente no
navegador com usuários descartáveis em `dev-local`: venda no PDV com a
opção marcada → cupom com o aviso → cadastro do cliente no site →
upload da foto → fila do Admin → aprovar (prazo calculado certo, 16/08
+ 30 dias = 15/09) → marcar como trocado → status refletido pro
cliente. Dados de teste revertidos (venda, estoque, caixa, cadastro de
proteção, usuários) antes do commit.

## 2026-08-14/16 — Convênios (código curto, login/vitrine online), saldo do Ponto, correção de upload e ajustes em Colaboradores

Sessão longa com vários pedidos encadeados. Resumo por tema:

**Convênios — código curto de validação no PDV:** trocado o link/QR longo
por um código numérico curto (`ConvenioMember.shortCode`, 6 dígitos,
gerado aleatoriamente, único por tenant) pra facilitar a conferência no
caixa.

**Convênios — login e vitrine online com desconto real:** o convênio
passou de "só informativo" pra dar acesso de fato à loja online. No
cadastro do convênio (link único que o colaborador acessa), agora é
obrigatório criar usuário/senha de loja — vínculo direto
`Customer.convenioMemberId` criado na mesma transação do cadastro
(evita o risco de account-takeover que existiria comparando por
CPF/telefone). Além do desconto fixo por nota já existente, o lojista
agora escolhe produtos específicos com desconto fixo em R$ (ex.: R$5
por produto, independente do valor da nota) que aparecem numa vitrine
no painel do cliente (`/loja/[subdomain]/conta`) — desconto aplicado de
verdade no checkout (`resolveEffectiveUnitPrice`, nunca acumula com
Oferta Relâmpago, vale o menor preço). Seleção de produtos no admin
(`/convenios/[id]`) usa o mesmo padrão de busca+lista dos "Produtos
comissionados" de Colaboradores.

**Bug real reportado por usuário — upload travando no cadastro de
convênio:** colaborador da Havan não conseguiu enviar o comprovante
(ficava carregando pra sempre, sem erro). Causa: nenhuma checagem de
tamanho no navegador antes do upload, e limite do servidor muito baixo
(5MB convênio / 3MB ponto) pra foto de celular real. Corrigido com
checagem client-side antes de chamar `upload()` (mensagem clara de
"foto muito grande") e limites do servidor aumentados (10MB
convênio, GIF liberado nos dois).

**Ponto — saldo do dia (extra/negativo):** cálculo de saldo do
intervalo (`computeBreakBalance`) e do dia (`computeDailyBalanceMinutes`
= trabalhado − jornada esperada, 8h por padrão, configurável em
`Tenant.attendanceSettings`) exibido em verde (crédito) ou vermelho
(débito) no painel do colaborador em `/ponto/colaborador/[userId]`.

**Colaboradores — Produtos comissionados (2 ajustes):** unificado o
antigo campo de busca inline + link separado "ver produtos" numa única
página (`/colaboradores/produtos-comissionados`); depois, como o link
pra essa página ficou escondido no meio de um parágrafo e o lojista não
achava, virou um botão preto de destaque ao lado de "Remover comissão
de todos".

**Testado:** `lint`, `typecheck`, `test` (99 passando) e `build`/`build:app`
limpos a cada etapa. Fluxo de convênio (cadastro, login, desconto no
checkout) e o botão de produtos comissionados verificados manualmente no
navegador, logado como usuário de teste descartável (criado e apagado
via SQL direto na branch `dev-local`, nunca em produção). PDV testado
de forma geral depois das mudanças do dia, sem regressão encontrada.
Cada mudança foi commitada, enviada (`push`) e verificada em produção
com `check:deploy` separadamente. Sem pendências.

## 2026-08-14 — Comissão de venda no painel de Colaboradores

Continuação do pedido de Colaboradores: plano de comissão pra Vendedor e
Gerente. Ideia inicial era um painel "Comissões" separado; o lojista
preferiu integrar no painel de Colaboradores já existente, como uma
terceira informação no card de cada um (junto com Adiantamento e
Mercadoria), com link pro histórico completo de vendas em nova aba.
Decisões confirmadas: comissão sobre o valor líquido (já com desconto do
item descontado, não o valor cheio); só vendas do PDV por agora (não
Assistência Técnica); é só relatório/consulta, sem controle de
pago/pendente (diferente do adiantamento e da compra).

**O que mudou:**
- `prisma/schema.prisma`: `Tenant.defaultCommissionPercent` (comissão
  geral, % sobre o líquido) e `Product.commissionPercent` (individual,
  opcional — sobrescreve a geral quando definida).
- `src/modules/employees/commission-service.ts` (novo): soma a comissão
  de todas as vendas concluídas de um vendedor (`Sale.sellerId`, já
  existente), usando a comissão do produto quando definida, senão a
  geral do tenant. Cálculo sempre ao vivo (não fica gravado por venda) —
  se o lojista mudar a % depois, o total recalcula sozinho.
- `src/app/(admin)/colaboradores/`: card de cada colaborador (agora
  todo Vendedor/Gerente ativo aparece, não só quem tem pendência) ganha
  a linha "Comissão de venda", que abre `/colaboradores/[userId]/comissao`
  (nova aba) com a lista de vendas e a comissão calculada em cada uma.
  Página também ganha uma caixa de configuração da comissão geral (%) no
  topo.
- `src/app/(admin)/produtos/product-form.tsx`: campo "Comissão
  individual (%)" na edição do produto — visível/editável só pra
  Admin/Gerente (`canManageEmployeeLedger`), mesmo que Estoquista edite
  o resto do produto; vazio = usa a comissão geral.

**Testado:** `lint`, `typecheck`, `test` (82 passando) e `build:app`
limpos, sem warnings novos. Prévia visual estática enviada pro lojista
(config geral + card + histórico) antes do deploy, mesmo motivo de
sempre (sem acesso a login nem ao servidor de dev da loja).

## 2026-08-13/14 — Ajustes de UX no PDV, botões da OS, vendedor obrigatório na OS e painel de Colaboradores

Sequência de pedidos do lojista testando ao vivo na loja, depois do deploy da reforma do PDV.

**1. Troco confuso no PDV** — duas vezes seguidas alguém digitou o valor do
cartão no campo "Valor recebido em dinheiro" por engano (campos vizinhos
na tela), gerando troco sem sentido (ex.: R$15 de troco numa venda que
devia fechar exata). Resolvido em 2 rounds, direto com o lojista testando:
primeiro escondi o campo atrás de um link ("Calcular troco"); ele preferiu
o campo sempre visível, então voltei atrás e, em vez disso, dei prefixo
"R$" dentro do campo e tirei as setinhas nativas de incrementar/decrementar
(também aplicado aos campos de valor do painel de pagamento misto) —
`src/app/(admin)/pdv/pdv-screen.tsx`, `mixed-payment-panel.tsx`,
`globals.css` (classe `.money-input`).

**2. Carrinho do PDV com rolagem horizontal escondendo "Remover"** — a
tabela de 5 colunas passava da largura disponível com nome de produto
grande, e o botão Remover (última coluna) ficava fora da área visível.
Reportado com vídeo (HEVC, Chrome não decodifica — segui pela descrição).
Corrigido virando cada item do carrinho num bloco que empilha/quebra
linha livremente, com Remover fixo num "×" no canto — sem tabela, não tem
rolagem horizontal possível — `pdv-screen.tsx`.

**3. Botões de impressão da OS confusos** — "Imprimir OS (A4)" continua
imprimindo a folha inteira sem formatação (não mudei o comportamento, só
adicionei os cupons 80mm do lado); a pedido do lojista, renomeei pra
deixar explícito: "Imprimir A4" e "Imprimir Cupom (entrada/entrega)" —
`repair-order-workspace.tsx`.

**4. Vendedor obrigatório no cadastro de OS** — diferente do PDV (que já
exige escolher o vendedor, sem assumir quem está logado), a OS só gravava
`createdById` de quem estava logado, sem opção de indicar outro
responsável. Adicionado `RepairOrder.sellerId` (obrigatório, migration
com backfill: OS existentes recebem quem registrou originalmente) e um
seletor obrigatório "Vendedor" no formulário, revalidado no servidor
(`isSellerAssignable`, reaproveitado do módulo de vendas).

**5. Painel de Colaboradores (novo)** — pedido do lojista: controlar
adiantamento de salário e compra de mercadoria de colaboradores, a
descontar depois. Investigação prévia: nada disso existia (`User` não tem
nenhum campo financeiro; o mais parecido era `FiadoEntry`, mas exclusivo
de cliente). Decisão com o lojista: lançamento manual (não integrado ao
PDV — mais simples, menos risco) e visível pra Admin + Gerente (diferente
do Fiado, que é só ADMIN).
- `prisma/schema.prisma`: model `EmployeeLedgerEntry` novo (tipo
  Adiantamento/Compra, valor, descrição, status Pendente/Pago, quem
  registrou) — mesmo padrão simples do `FiadoStatus`.
- `src/lib/permissions.ts`: `canManageEmployeeLedger` (Admin + Gerente).
- `src/modules/employees/employee-ledger-service.ts` (novo): criar
  lançamento, quitar, resumo de saldo pendente por colaborador.
- `src/app/(admin)/colaboradores/` (novo): painel com cards de saldo
  pendente por colaborador, formulário de novo lançamento, tabela de
  lançamentos com "Marcar como pago".
- `src/components/admin/nav-items.ts`: item novo "Colaboradores" no menu.

**Testado**: `lint`, `typecheck`, `test` (82 passando) e `build:app`
limpos em cada mudança, sem warnings novos. Prévias visuais estáticas (com
dados de exemplo, mesmo CSS/estrutura real) geradas e enviadas pro lojista
antes de cada deploy grande (cupom, carrinho, colaboradores), já que não
digito senha em login nenhum e o servidor de dev local não é alcançável
da loja. Todos os deploys confirmados no ar via `npm run check:deploy`,
sem erro nos logs.

## 2026-08-13 — Reforma do PDV: layout, tipografia, desconto por linha e regra de segurança para películas

**Pedido do usuário:** 5 mudanças no PDV. (1) Painel de formas de pagamento
virar lista vertical com itens grandes. (2) Lateral reordenada: Cliente →
Vendedor → Total → Forma de pagamento → Finalizar. (3) Tipografia em preto
e negrito, fontes maiores para valores/títulos. (4) Desconto por linha
aplicado uma vez sobre o total da linha (nunca multiplicado pela
quantidade), com a observação "desconto aplicado nesta linha". (5) Regra
de segurança: Vendedor pode dar desconto sozinho (sem Gerente) só em
"Película 3D" (R$30 → desconto máx. R$20, mínimo R$10) e "Película 3D
Privativa" (R$40 → desconto máx. 50%/R$20, mínimo R$20) — e só quando há
uma capinha no carrinho; removendo a capinha, o desconto some sozinho.
Gerente/Admin continuam sem essa trava (confirmado com o usuário).

**Investigação prévia:** o desconto por item (commit `da18ad9`, da sessão
anterior) já é um valor fixo em R$ aplicado uma vez sobre o total da linha
— não havia bug de multiplicação por quantidade, só faltava o texto de
observação pedido. Nenhum produto do catálogo se chama literalmente
"Película 3D (Vidro)"/"Privativa (Vidro)" — confirmei no banco (`dev-local`)
que a família real é "Película 3D - marca - modelo" (196 produtos a
R$30, mais 1 kit fora do padrão a R$40) e "Película 3D PRIV - marca -
modelo" (52 produtos, todos a R$40) — os preços batem exatamente com o
que o usuário descreveu, então identifico por nome + preço exato (isso já
exclui kits/modelos premium automaticamente). Capinha = categoria "Capas"
(350 produtos, nome exato confirmado no banco).

**O que mudou:**
- `src/lib/seller-discount-rules.ts` (novo): `getSellerDiscountRule` (nome
  + preço → teto de desconto) e `isCapinhaCategory`, compartilhado entre
  cliente e servidor.
- `src/modules/sales/sale-service.ts`: valida a regra do Vendedor
  server-side (produto elegível, capinha na venda, teto por quantidade) —
  Gerente/Admin (`ctx.allowDiscount`) seguem sem restrição, como já era.
- `src/app/(admin)/pdv/actions.ts`: `PdvProduct` ganha `categoryName`
  (necessário pra detectar capinha no carrinho).
- `src/app/(admin)/pdv/pdv-screen.tsx`: `CartLine` ganha `categoryName`;
  nova função `maxLineDiscount` centraliza o teto (ilimitado pro
  Gerente/Admin, regra da película + capinha pro Vendedor); `useEffect`
  zera o desconto e mostra aviso quando a capinha sai do carrinho; lateral
  reordenada em 4 cards (Cliente, Vendedor, Total, Pagamento); tipografia
  em preto/negrito nos valores e títulos; texto "Desconto aplicado nesta
  linha" no lugar de "desc.". Este arquivo já trazia, não commitada, a
  integração de pagamento misto (`MixedPaymentPanel`/`payment-slots.ts`)
  de um trabalho anterior — a reforma de hoje se apoiou nela e reorganizou
  o mesmo trecho, então o commit carrega as duas coisas juntas (não deu
  pra separar por hunk sem risco de quebrar o arquivo).
- `src/components/payments/mixed-payment-panel.tsx`: formas de pagamento
  viram lista vertical de botões grandes (era um `flex-wrap` de botões
  pequenos); "Pago"/"Restante" maiores e em negrito. Esse componente
  (novo, ainda não commitado antes de hoje) é compartilhado com o acerto
  financeiro da Assistência Técnica — o visual novo vale lá também.

**Sem mudança de schema.**

**Testado:** `lint`, `typecheck`, `test` (82 passando) e `build:app`
limpos, sem warnings novos — `/pdv` compilou certo no build de produção.
**Não testei visualmente no navegador** — mesmo motivo da mudança
anterior (não digito senha em campo de login, nem em ambiente local).
Servidor de dev (`npm run dev`) segue rodando pra o usuário conferir.

**Nada commitado nem enviado a produção.**

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

## 2026-08-12 — Mesclar cadastros de cliente duplicados

**Pergunta do usuário:** hipoteticamente, um cliente "João" é cadastrado
manualmente no PDV e, sem saber, se cadastra de novo sozinho pelo catálogo
online — como fica isso? Investigação confirmou: `Customer` não tem
nenhuma constraint de unicidade por telefone/e-mail/documento, e o código
já tem uma decisão deliberada de não vincular automaticamente por esses
dados (comentário em `order-service.ts`: vínculo automático por telefone
abriria brecha de account takeover de um cadastro antigo). Resultado: dois
registros `Customer` sem nenhum vínculo, cada um com seu próprio saldo de
crédito, histórico de compras e (no máximo um dos dois) login.

**O que mudou:**
- `src/lib/permissions.ts`: `canMergeCustomers` (só ADMIN — ação
  irreversível).
- `src/modules/customers/customer-service.ts` (`mergeCustomers`):
  transação que reatribui pro cadastro "mantido" tudo que pertencia ao
  "absorvido" — `Sale`, `Order`, `FiadoEntry`, `CustomerCreditMovement`,
  `RepairOrder`, `WhatsAppContact`, `CustomerSession` (sessão de login
  ativa continua válida, agora autenticando como o cadastro mantido) e
  `ProductReview` (pulando a do absorvido quando os dois já avaliaram o
  mesmo produto — violaria `@@unique([tenantId, productId, customerId])`).
  Soma `creditBalance`/`totalSpent`, mantém a data de última compra mais
  recente, e transfere `username`/`passwordHash` quando só um dos dois tem
  login. Bloqueia (erro claro) se os dois já tiverem login próprio — exige
  resolução manual antes. Apaga o cadastro absorvido ao final.
- `src/app/(admin)/clientes/actions.ts`: `mergeCustomersAction` (permissão
  + log de auditoria) e `getCustomerMergeCandidateAction` (resumo do
  candidato antes de confirmar).
- `src/app/(admin)/clientes/merge-customer-panel.tsx` (novo) +
  `[id]/page.tsx`: seção "Mesclar cadastro duplicado" na ficha do cliente,
  visível só pra Administrador — busca o duplicado, mostra resumo
  (documento, telefone, contagem de vendas/pedidos/fiado, crédito, login)
  e confirma.
- `src/modules/audit/audit-service.ts`: nova ação `customer.merge`.

**Sem mudança de schema** — só reaproveita relações já existentes.

**Testado:** `lint`, `typecheck`, `test` (82 passando) e `build` completo,
sem erros, antes do deploy. Ninguém testou o fluxo real ainda (mesclar
dois cadastros de verdade e conferir se tudo foi transferido certo).

**Commitado e em produção** (commit `d6ed8dc`). Deploy confirmado via
`npm run check:deploy`: Ready na Vercel, páginas públicas e
`comprar-whatsapp` respondendo certo, sem erros recentes nos logs.
**Pendência: validar o fluxo de mesclagem na prática.**

## 2026-08-12 — Troca de item por defeito, sem cancelar a venda inteira

**Pedido do usuário:** na tela da venda (menu "Troca" → busca o cupom → `/vendas/[id]`),
só existia "Cancelar venda" (tudo ou nada). Pedido: um jeito de registrar
que um item específico veio com defeito — com foto do produto e descrição
do motivo (ambos obrigatórios) — sem cancelar a nota inteira. Inicialmente
cogitei reaproveitar o módulo de Assistência Técnica, mas o usuário
esclareceu que não tem relação nenhuma com conserto de celular — é um
registro de controle de trocas, separado.

**O que mudou:**
- Schema (aditivo, não mexe em `Sale`/`SaleItem` existentes): tabelas novas
  `SaleItemDefect` (item, quantidade, motivo, crédito gerado, quem
  registrou) e `SaleItemDefectPhoto` (mesmo padrão já usado em
  `RepairOrderPhoto`, tabela separada em vez de array nativo). Migration
  `20260812195923_add_sale_item_defect_tracking`, 100% aditiva.
- `src/app/(admin)/vendas/[id]/sale-controls.tsx`: botão **"Produto com
  defeito"** ao lado de "Cancelar venda" (mesma regra de permissão,
  `canCancelSale`), abrindo um painel — item (se a venda tiver mais de
  um), quantidade, cliente (recebe o crédito), motivo e foto — reaproveita
  só o componente `MultiImageUploadField` da Assistência Técnica, não o
  módulo inteiro.
- `src/modules/sales/sale-service.ts` (`reportSaleItemDefect`): valida que
  a quantidade reportada não passa do que sobrou daquele item (soma dos
  registros anteriores), exige cliente vinculado ou selecionado (mesma
  regra do cancelamento), gera crédito de loja só do valor daquele item e
  **não** devolve ao estoque vendável (produto defeituoso não pode ser
  revendido — ajuste manual se for o caso). Total/subtotal da venda ficam
  intactos, mesmo princípio do cancelamento total hoje; o comprovante só
  ganha uma marca "Trocado por defeito" no item.
- `src/modules/audit/audit-service.ts`: nova ação `sale.item_defect` no
  log de auditoria.

**Testado:** `lint`, `typecheck`, `test` (82 passando) e `build` completo
(roda `prisma migrate deploy`) sem erros, todos antes do deploy. Sem
acesso a um ambiente de preview de verdade (a Vercel deste projeto não tem
banco de Preview separado — `DATABASE_URL` de Preview aponta pro mesmo
banco de produção — e o link de preview veio protegido por login da
Vercel, que o usuário não tem no celular), então a decisão foi mesclar
direto na `main` e validar em produção. **Ninguém testou o fluxo real
ainda** (registrar uma troca de verdade, conferir o crédito gerado e a
marca no comprovante).

**Commitado e em produção** (branch `feat/troca-item-defeito` mesclada e
apagada, commit de merge `819bf1d`). Deploy confirmado via
`npm run check:deploy`: Ready na Vercel, páginas públicas e
`comprar-whatsapp` respondendo certo, sem erros recentes nos logs.
**Pendência: validar o fluxo de troca por defeito na prática** assim que
alguém puder testar.

## 2026-08-12 — Retomada: grade de pagamento sempre visível no PDV (sem modal)

**Contexto:** sessão anterior foi interrompida no meio de uma refatoração —
o working tree ficou com `src/app/(admin)/pdv/pdv-screen.tsx` quebrado (build
não compilava): o topo do arquivo já tinha trocado o estado `payments`
(linhas de pagamento + modal) por `amounts` (um valor por método, sempre
visível), mas o resto do arquivo (cálculos de troco/parcelas, `finalizeSale`,
JSX da seção "Formas de pagamento", reset pós-venda) ainda usava o modelo
antigo. Pedido do usuário: "retoma o comando anterior".

**O que mudou:** terminei a migração de forma consistente com a intenção já
registrada no comentário do próprio código (pedido explícito do usuário:
reduzir atrito, sem precisar abrir modal pra escolher método antes de
digitar o valor).
- `src/app/(admin)/pdv/pdv-screen.tsx`: `paid`/`cashPortion`/
  `storeCreditPortion`/`fiadoPortion` agora derivam de `amounts` +
  `PAYMENT_SLOTS`; nova `setPaymentAmount(key, valor)` substitui
  `openPaymentModal`/`confirmPayment`/`removePaymentLine`; `finalizeSale`
  monta o payload `payments` a partir dos slots com valor > 0; reset
  pós-venda usa `setAmounts(EMPTY_PAYMENTS)`; remover cliente agora move os
  valores de Crédito de loja/Fiado de volta pra Dinheiro (mesmo espírito do
  comportamento antigo, adaptado pro novo modelo); seção "Formas de
  pagamento" virou uma grade com um campo de valor por método (Dinheiro,
  Crédito, Débito, Chave PIX, Pix Maquininha, Mercado Pago, Crédito de loja,
  Fiado), cada um desabilitado com `title` explicando o motivo quando não
  há vendedor selecionado ou o cliente não é elegível (crédito de loja sem
  saldo, fiado sem `canFiado`/cliente).
- Removido `src/app/(admin)/pdv/payment-method-modal.tsx` (modal antigo,
  sem mais nenhuma referência no código — confirmado por busca no repo).

**Testado:** `npm run lint` (0 erros, só os 7 warnings pré-existentes de
`react-hook-form`/React Compiler em arquivos não relacionados),
`npm run typecheck` (limpo), `npm run build:app` (build completo sem erros)
e `npm run test` (82 testes passando, nenhuma quebra). Teste visual no
navegador foi iniciado (subi `npm run dev`, abri `/pdv`), mas parei na tela
de login — entrar com senha está fora do que eu posso fazer sozinho. O
usuário confirmou que o problema relatado em produção (travar depois de
selecionar a primeira forma de pagamento, impossível combinar duas ou mais
na mesma venda) é o mesmo que esta mudança resolve, e autorizou deploy sem
teste visual por não ter acesso ao local do PDV no momento — não deu pra
validar a interação real na tela antes de ir pro ar.

**Commitado e em produção** (commit `3c0dddb`, `pdv-screen.tsx` modificado,
`payment-method-modal.tsx` removido). Deploy confirmado via
`npm run check:deploy`: status Ready na Vercel, painel/loja/produto/
categoria/`comprar-whatsapp` todos respondendo certo, sem erros recentes
nos logs. **Pendência: teste visual real do fluxo de split de pagamento
ainda não foi feito por ninguém** — validar assim que alguém tiver acesso
ao PDV. `.codex/` continua não rastreado, sem relação com esta sessão.

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

## 2026-08-14 — Convênios Corporativos (Fase 1), WhatsApp da OS e histórico de caixa por Vendedor

Últimas três mudanças da sessão de hoje (que também cobriu, antes destas,
uma rodada grande em comissão de venda — opt-in por produto, trava de
desconto pra Gerente, e as telas de gestão em Colaboradores — já
commitadas e no ar em commits anteriores).

**1. Convênios Corporativos — Fase 1 (modelagem + cadastro manual).**
Novo módulo pra parcerias com empresas externas, com a Havan como piloto,
desenhado desde o início pra caber qualquer convênio (não uma regra fixa
da Havan no código). Antes de implementar, apresentei uma análise técnica
completa (riscos de fraude, LGPD, arquitetura) como artifact, e o usuário
respondeu 5 decisões: aprovação só por Admin/Gerente da EficazBr;
desconto do convênio não reduz a comissão do vendedor (exige campo
`Sale.convenioDiscount` separado do desconto normal, a implementar na
Fase 3 — ainda não existe); comprovante obrigatório; limite de 1 uso/dia
resetando à meia-noite; leitor de código de barras físico já lê QR Code.
Migration `20260814173022_add_convenios_corporativos` (tabelas `Convenio`
e `ConvenioMember`, 100% novas, CPF duplicado travado no banco via
`@@unique([convenioId, document])`). Painel em `/convenios` (lista,
cadastro, edição) e `/convenios/[id]` (detalhe + colaboradores com
aprovar/suspender/bloquear/cancelar, sempre com motivo registrado).
Link público, selfie por câmera ao vivo e QR Code ficam pras Fases 2 e 3,
sem mudar este modelo. Commit `eb36e12`.

**2. OS: comprovante não abria direto no WhatsApp do cliente.** O botão
"Compartilhar comprovante" usava a Web Share API do navegador quando
disponível — no Windows (Edge/Chrome) ela existe, mas não sabe pra qual
contato mandar, então só abria o painel genérico de compartilhamento do
sistema em vez da conversa do cliente (usuário mandou vídeo confirmando).
Removido o caminho da Web Share API; agora sempre usa o link direto
`wa.me/[telefone]?text=...`, que já funcionava certo como "reserva" antes
da Web Share API existir. Botão renomeado pra "Enviar comprovante no
WhatsApp". Commit `b03b91f`.

**3. Histórico de caixa/vendas — Vendedor só vê o próprio caixa aberto.**
Pedido do usuário: Vendedor só deveria acessar o histórico de vendas do
caixa que ele mesmo abriu, e só enquanto estiver aberto (some ao fechar).
Investigação encontrou `/caixa/historico` **sem nenhuma checagem de
permissão** — qualquer papel via o histórico completo de todos os
caixas, de todo mundo, incluindo fechados. Corrigido: Admin/Gerente
continuam vendo tudo; Vendedor só vê o próprio caixa aberto (filtro
`openedById` + `status: "OPEN"`). Na sequência, percebi que isso sozinho
não dava ao Vendedor nenhum jeito de ver a lista de vendas em si (só a
contagem) — `/vendas` era redirecionada pra busca por número pra quem
não fosse Admin/Gerente. Estendido: `/vendas` agora aceita Vendedor,
mostrando só as vendas do caixa aberto dele (mesma regra de
abrir→fechar); adicionei atalho "Vendas" no cabeçalho do PDV e no menu
lateral pra esse papel, que antes não existiam. Por fim, a pedido do
usuário, cada linha de `/caixa/historico` ganhou um link "Ver vendas"
pra Admin/Gerente entrarem na lista de vendas de qualquer caixa
específico (aberto ou fechado), com uma faixa de contexto (quem
abriu/fechou, quando) e um jeito de voltar pra lista geral. Commits
`a0aefd4` e `79932b2`.

**Testado em todas as três:** `lint`, `typecheck` e `npm run build:app`
sem erros nem warnings novos (Convênios usou `npm run build` completo,
por envolver migration). Nenhuma foi testada no navegador contra dados
reais — validação só estática, sem login disponível pra simular os
papéis Admin/Gerente/Vendedor lado a lado.

**Tudo commitado**, aguardando `git push` (não subido ainda no momento
deste relatório).

## 2026-08-15 — Convênios Corporativos Fase 3 (QR + PDV) + correções pontuais

**Contexto:** sessão seguiu direto da anterior. Antes desta Fase 3, ainda
dentro da mesma leva: correção do erro de "número do cupom" fora do lugar no
impresso térmico (`Venda`/valor separados por `flex justify-between` viravam
duas linhas soltas no papel — trocado por um span só, número logo depois da
palavra), correção de "nenhum caixa aberto" indevido pro Vendedor
(`/vendas` e `/caixa/historico` estavam filtrando pelo caixa que o próprio
usuário abriu — corrigido pra considerar qualquer caixa aberto no momento,
já que o caixa é físico e passa de vendedor pra vendedor no mesmo turno), e
a regra de desconto de película por quantidade de capinha (1 capinha =
desconto em 1 película, não em quantas películas o carrinho tiver — nova
função `allocateSellerDiscountBudget`, aplicada no PDV e revalidada em
`sale-service.ts`). Commits `cceed47`, `965a92a`, `e4b3dbe`.

**Fase 3 propriamente dita — credencial digital (QR) + validação no PDV:**

- Schema: `ConvenioMember.credentialTokenHash` (hash SHA-256, gerado na
  criação do cadastro — manual e autoatendimento — e estável entre
  suspensão/reativação, pra não invalidar o QR já salvo); tabela nova
  `ConvenioRedemption` (uso do benefício numa venda, com reversão registrada
  sem apagar histórico); `Sale.convenioDiscount` (separado de `discount` de
  propósito — nunca reduz a comissão, calculada em `SaleItem.total`, que o
  convênio nunca toca). Migration escrita à mão
  (`20260815041032_add_convenio_redemption_and_credential`) porque
  `prisma migrate dev` pede confirmação interativa pra coluna nova
  obrigatória+única — confirmei antes que a tabela `convenio_members`
  estava vazia no `dev-local`, então sem risco de conflito.
- Página pública nova `/c/[token]` — "carteirinha" do colaborador: mostra
  status (pendente/suspenso/bloqueado/expirado) ou, se ativo, o QR Code
  (gerado com o pacote `qrcode`, já usado no comprovante de OS). Mesmo link
  é mostrado uma única vez ao colaborador logo após o cadastro (manual ou
  autoatendimento) — só o hash fica salvo, então perder o link exige gerar
  outro cadastro, mesmo princípio já usado no link de convite.
- PDV: botão "Escanear QR do convênio" (`convenio-modal.tsx`) — valida o
  código lido pelo leitor físico (mesmo campo já usado pra código de
  barras, reconhecendo o padrão `/c/[token]`) ou digitado à mão, mostra
  foto + nome do colaborador pro vendedor confirmar visualmente antes de
  aplicar (mitigação de "QR provado posse, não identidade", já registrada
  no plano do módulo), injeta uma linha de benefício travada no carrinho.
- `sale-service.ts`: revalida tudo de novo no momento de fechar a venda
  (status, convênio ativo, validade, limite de uso do período) — nunca
  confia só na checagem prévia do PDV, já que o tempo entre escanear e
  pagar pode mudar o status. Cria o `ConvenioRedemption` na mesma transação
  da venda. `cancelSale` reverte o registro (sem apagar) quando a venda é
  cancelada, pra não continuar contando no limite de uso nem no dashboard
  futuro do convênio.
- Comprovante (`/vendas/[id]`) ganhou a linha "Benefício Convênio [nome] —
  [colaborador]" quando aplicado.

**Correções de texto/observação durante a Fase 3:**
- Página pública do cadastro (`/convenio/[slug]/[token]`) estava dizendo só
  "R$5,00 de desconto nas suas compras", sem deixar claro que é por dia —
  corrigido pra descrever a frequência em linguagem natural a partir da
  regra do convênio (ex.: "uma vez por dia").
- Usuário pediu pra acrescentar "sorteio semanal" e "prêmio mensal pro 1º
  lugar do ranking" nessa mesma página. Recusei implementar sem
  confirmação: sorteio/campanha vinculado a compra é atividade regulada no
  Brasil (Lei 5.768/71, autorização prévia via SECAP), exatamente o risco
  já sinalizado no plano do módulo (seção de Campanhas, marcada como fase
  futura condicionada a essa autorização). Perguntei explicitamente antes
  de mexer; usuário confirmou seguir só com o ajuste "por dia" por agora,
  sem a parte de sorteio/ranking.

**Testado:** `lint`, `typecheck`, os 82 testes automatizados (Vitest) e
`npm run build` completo (com migration) sem erros nem warnings novos.
Migration aplicada em `dev-local` (`ep-fragrant-frog-ac9yf3aa`), nunca em
produção diretamente — vai pra produção no próximo deploy normal via
`prisma migrate deploy` dentro do `npm run build`. Não testado no navegador
contra dados reais (sem login disponível pra simular o fluxo completo:
cadastro → aprovação → escanear QR no PDV → fechar venda). Vale o usuário
testar esse fluxo ponta a ponta antes de anunciar o benefício pra Havan de
verdade.

## 2026-08-21 — Ajuste rápido de estoque na listagem de Produtos + Ranking de Comissão (tema Matrix)

**1. Continuidade do ajuste rápido de estoque direto na listagem de Produtos**
(implementado numa sessão anterior, ainda não commitado). Duas caixinhas por
linha — "+" soma à quantidade atual (reposição), "Def." define o valor
absoluto (correção de contagem, inclusive pra zerar estoque negativo) —
usando `applyStockMovement`, extraído como serviço compartilhado entre o
formulário dedicado (`/estoque/novo`) e o atalho inline, pra não duplicar a
lógica de transação + `StockMovement` + auditoria. Testado ao vivo no
navegador (subindo o dev server e logando manualmente, já que não insiro
senha em campo nenhum): "+" e "Def." atualizam a linha sem reload, com toast
de confirmação. `lint`, `typecheck` e `build:app` sem erros/warnings novos.
Commit `00a12bf`.

**2. Novo Ranking de Comissão, tema Matrix.** Pedido do usuário: um gráfico
no menu, logo abaixo de "Assistência Técnica", mostrando os vendedores
ranqueados pela comissão. Página nova em `/colaboradores/ranking-comissao`
(Admin/Gerente, mesma permissão de `/colaboradores`). A métrica não é a
alíquota configurada (essa é igual pro catálogo todo, só varia por produto)
e sim a **comissão efetiva** de cada vendedor — comissão recebida ÷ total
vendido, em % — que reflete o mix de produtos que cada um vendeu. Nova
função `getCommissionRanking` em `commission-service.ts`. Visual: fundo
preto, textura sutil de grade, fonte monoespaçada, medalhas 🥇🥈🥉 pro
top 3, nome em branco, porcentagem em verde com glow, barra em gradiente
verde proporcional ao valor, e os valores em R$ sempre visíveis (não só no
hover). Banco `dev-local` não tem nenhuma venda concluída registrada, então
o estado vazio foi o que testei dentro do app de verdade; o visual da lista
populada foi conferido à parte, numa página HTML estática isolada (fora do
repo, com dados fictícios), sem tocar no banco. `lint`, `typecheck` e
`build:app` sem erros/warnings novos. Commit `bcbbc8d`.

**3. Push e verificação pós-deploy.** A pedido do usuário, os dois commits
foram enviados (`git push origin main`); deploy na Vercel acompanhado até
`Ready` e `npm run check:deploy` rodado — home do painel, home da loja,
página de produto, filtro por categoria, rota `comprar-whatsapp` (redirect,
não 500) e logs de erro recentes, tudo OK.

**Nota:** o restante do work-in-progress que já estava no working tree antes
desta sessão (garantia em Assistência Técnica, painel de horas de
Colaboradores, validações de `employee-ledger`/`repair-order`, scripts de
QA multitenant, `docs/auditoria-*`/`plano-correcao.md`/`marketplace-readiness.md`,
migration de garantia) não foi tocado nem commitado — não fazia parte do
pedido desta sessão.

## 2026-08-21 (continuação) — Retomada do WIP: garantia em OS, passagem no pagamento por horas, e commit de tudo que estava pendente

Pedido do usuário para continuar o trabalho que já estava pronto no working
tree (não fazia parte da sessão anterior, registrada acima) e, em seguida,
commitar.

**1. Verificação do que já estava implementado.** As duas features de
código já estavam completas (garantia encadeada em OS entregues, com
migration `20260817150000_add_repair_order_warranty_chain`; passagem
opcional somada ao pagamento por horas dos Colaboradores) — faltava só
validar. Rodado `lint` (0 erros, só os 9 warnings pré-existentes de sempre),
`typecheck` (limpo), `npm run build` completo (com `prisma migrate deploy`,
por envolver schema/migration) e `npm test` (110 testes, todos passando).
Nenhum código foi alterado nesta etapa, só verificado.

**2. Commits.** A pedido do usuário, tudo que estava pendente no working
tree foi organizado em commits separados por assunto: garantia em OS,
passagem no pagamento por horas, suíte de integração de QA multi-tenant
(Etapa B da auditoria, com os scripts de seed/cleanup e os testes contra o
banco `dev-local`), e os documentos de auditoria/plano de correção (Etapa A,
diagnóstico estático, sem alteração de código). Não commitado: `.codex/`
(config de hooks de outra ferramenta, não relacionada a este código —
deixado de fora até confirmar com o usuário se deve entrar no repositório).
Nada foi enviado ao remoto (`git push`) nesta etapa.

**3. Push e verificação pós-deploy.** A pedido do usuário, os 5 commits
acima foram enviados (`git push origin main`); deploy acompanhado até
`Ready` e `npm run check:deploy` OK.

## 2026-08-21 (continuação 2) — Link e filtro de período no Ranking de Comissão; OS em Vendas; edição de venda por Admin

Três pedidos em sequência do usuário, cada um virando commit próprio.

**1. Link em cada vendedor no Ranking de Comissão** pra tela de comissão
individual (`/colaboradores/[userId]/comissao`, que já existia com lista de
vendas do período e filtro de data — só faltava o link de acesso a partir
do ranking). Commit `3a1cc20`.

**2. Filtro de período no Ranking de Comissão**, que antes só mostrava o
dia de hoje sem opção de trocar. Reaproveitado o `PeriodPicker` padrão dos
Relatórios; `resolvePeriod` ganhou um `defaultFrom` opcional pra manter
"hoje" como abertura padrão desta tela (é um placar do dia) sem afetar o
padrão "mês atual" das outras páginas que já usam a função.
`getCommissionRanking` passou a receber o range em vez de calculá-lo
internamente. Commit `6b27d09`.

**3. OS de Assistência Técnica listada junto em Vendas, só pra comparação**
(pedido do usuário: "para que eu venha comparar"). Decisão tomada com o
usuário via pergunta explícita antes de codar: a OS **não vira uma Sale de
verdade** — só uma linha a mais na mesma tabela, com tag "OS" numa coluna
"Tipo" nova e link pro comprovante da própria OS. Evita duplicar em
estoque/comissão (o pagamento de OS já é lançado no caixa por outro
caminho, `repair-payment-service.ts`). Só aparece pra quem tem acesso à
Assistência Técnica; nunca aparece no filtro "Canceladas". Commit `a7e4856`.
Teste ao vivo da tag "OS" com um pagamento real não foi concluído (fricção
no formulário de automação do navegador) — vale conferir visualmente na
primeira OS que passar por lá.

**4. Admin pode corrigir preço/desconto de item já vendido** (pedido do
usuário: poder editar a nota, não só cancelar, mantendo histórico de quem
editou). Decisões de escopo também fechadas com o usuário antes de codar
(todas as recomendadas): só preço/desconto de item existente (nunca troca
produto, quantidade, nem adiciona/remove linha); a gravação é **recusada**
se o total corrigido não bater exatamente com o total original (isso é
correção, não troca/reembolso); bloqueado se o caixa da venda já fechou.
Migration pequena `Sale.editedAt`/`editedById` (mesmo padrão de
`cancelledAt`/`cancelledById`) mostra aviso no comprovante; o detalhe
completo de cada correção (valor antigo → novo, por item) vai pro log
central de auditoria (`AuditLog`, ação nova `sale.edit`). Testado ao vivo no
dev-local: venda real criada pelo PDV (`Adaptador 3 saidas`, R$7), preço
corrigido pra R$8 com desconto de R$1 (total mantido em R$7,00) —
comprovante e `/usuarios/atividades` conferidos com o registro certo.
Commit `4648571`.

**Testado:** `lint` (0 erros, warnings pré-existentes de sempre),
`typecheck` e `npm run build` completo (envolve a migration acima) limpos.
`npm test` com os 110 testes unitários passando. Push dos 3 commits feito a
pedido do usuário; `check:deploy` OK depois (painel, loja, produto,
categoria, `comprar-whatsapp`, logs sem erro novo).

**Pendência:** `.codex/` segue não commitado (mesma observação da sessão
anterior).

## 2026-08-22 — Comissão de venda: alíquota única de 2%, remove bônus fixos

Pedido do usuário a partir de uma observação sobre o print do Ranking de
Comissão: em vez do esquema anterior (só produto marcado com
`commissionEnabled` entrava na comissão, mais dois bônus fixos — R$1/unidade
no kit capinha+película com desconto do vendedor, e R$2 por cadastro de
Proteção Eficaz aprovado), pediu pra comissão virar uma alíquota única de 2%
sobre todo o catálogo, removendo os bônus fixos. Esclarecido em seguida, a
pedido dele mesmo: o percentual/valor fixo configurado num produto
específico (`Product.commissionPercent`/`commissionFixedAmount`) continua
funcionando como **exceção** — só o padrão vira 2% pra tudo que não tiver
essa exceção, em vez de precisar marcar produto por produto.

`commission-service.ts` simplificado: removidas `kitDiscountCommissionForItems`,
`getProtecaoEficazCommissionByUsers` e a checagem de `commissionEnabled`;
`itemCommission` passa a aplicar sempre `commissionPercent` do produto (se
configurado) ou `Tenant.defaultCommissionPercent` (2%), com o tipo `FIXED`
por unidade ainda disponível como exceção também. Nenhuma mudança de schema
— os campos de comissão por produto continuam no banco, só deixam de ser
checados como "habilitado/desabilitado" (o toggle "Comissionar todos os
produtos" e o de cada produto na tela de Colaboradores ficam sem efeito
prático agora — sinalizado ao usuário, ainda não removido da UI).

Verificado com dados reais no dev-local (script temporário, apagado ao
final): venda de R$7 → comissão R$0,14 no padrão de 2%; com uma exceção de
10% configurada no produto vendido → R$0,70; revertida a exceção, volta a
R$0,14 — confirma tanto o padrão quanto a exceção funcionando.
`defaultCommissionPercent` setado para 2 no tenant do dev-local pra ficar
condizente com produção (é dado, não código — o usuário ainda precisa
ajustar manualmente na tela de Colaboradores em produção). `lint`,
`typecheck`, `build:app` e os 110 testes unitários limpos. Commit `9b7ee63`,
enviado ao remoto a pedido do usuário; `check:deploy` OK depois (painel,
loja, produto, categoria, `comprar-whatsapp`, logs sem erro novo).

**Observação para o usuário:** o Ranking de Comissão, que antes ranqueava
por "comissão efetiva" (variava pelo mix de produtos vendidos), agora tende
a mostrar a mesma porcentagem (2%) pra todo mundo — o que diferencia os
vendedores no ranking passa a ser o valor em R$ (segue o volume vendido),
não mais a eficiência do mix. Não alterado sem confirmação; só registrado
aqui como consequência natural da mudança.

### Correção no mesmo dia — alíquota de 2% não pode retroagir

Poucas horas depois, o usuário viu no Ranking de Comissão (print anexado)
vendas de dias anteriores já contando comissão, e pediu: a regra de 2% é
pra começar a valer só a partir de 21/08/2026 (dia em que foi decidida) —
antes disso não deveria existir comissão nem histórico de ranking nenhum.

Adicionado `COMMISSION_POLICY_EFFECTIVE_AT` (`2026-08-21T00:00:00-03:00`)
em `commission-service.ts`: toda consulta de comissão (`getCommissionTotalsByUsers`,
usada tanto no total acumulado do colaborador quanto dentro do Ranking; e
`getSellerCommissionHistory`) passa a ignorar qualquer venda anterior a essa
data, mesmo quando o período pedido começa antes — inclusive o total "desde
sempre" mostrado no card do colaborador. No histórico individual de vendas
(`/colaboradores/[userId]/comissao`), a venda antiga continua aparecendo na
lista (é útil pra comparar), só a comissão dela sai R$0,00; no Ranking,
tanto o total vendido quanto a comissão do período ficam limitados a partir
do corte, pra não existir "história" de ranking anterior a ele.

Verificado no dev-local: venda de teste (a mesma `#9` da sessão anterior)
com `createdAt` alterado artificialmente pra 20/08 → comissão zera; restaurado
o valor real (21/08 à noite) → volta a calcular os R$0,14 normalmente.
`lint`, `typecheck`, `build:app` e os 110 testes unitários limpos. Commit
`3940ed3`, enviado ao remoto a pedido do usuário; `check:deploy` OK depois
(único aviso nos logs: duas tentativas de login com senha errada, sem
relação com o deploy).

## 2026-08-22 (continuação) — Desconto automático de R$15 em película com capinha

Pedido do usuário: toda película (e "tudo gel") vendida junto com uma
capinha na mesma nota deveria receber R$15 de desconto, e o desconto some
se a capinha sair da venda. Antes de codar, perguntas fechadas com o
usuário (todas as recomendadas): substitui totalmente a regra antiga (só 2
películas 3D específicas, desconto até R$20 digitado pelo vendedor,
limitado 1 capinha = 1 película); o novo desconto é automático, sem o
vendedor escolher nada; vale pra toda película da venda sem limite pela
quantidade de capinha (1 capinha já libera pra todas); "capinha" = categoria
Capas, "película/gel" = categoria Película (inclui as de hidrogel — não
existe categoria "Gel" separada no catálogo, confirmado consultando o banco).

`seller-discount-rules.ts` reescrito: saem `getSellerDiscountRule` e
`allocateSellerDiscountBudget` (regra antiga), entra `peliculaKitUnitDiscount`
(R$15, nunca mais que o preço do item). `sale-service.ts`: película deixa de
passar pela checagem de permissão de desconto — é sempre recalculada a
partir da regra, ignorando qualquer valor de desconto vindo do cliente.
`pdv-screen.tsx`: novo `withPeliculaKitDiscount`, chamado depois de
adicionar/mudar quantidade/remover item do carrinho — o campo de desconto
da película deixou de ser editável (mostra só o valor automático ou "Precisa
de capinha na venda"). Prop `canDiscountFreely` removida do componente
(ficou sem uso depois da mudança; a permissão em si continua existindo em
`permissions.ts`, usada em `pdv/actions.ts` pra desconto livre em outros itens).

Verificado com o service de vendas de verdade (`createSale`) no dev-local:
capinha + 2 películas → R$15 de desconto em cada (R$30 total); só película
sem capinha → R$0; tentativa de forjar R$999 de desconto numa película →
ignorada, recalculada pra R$15. `lint`, `typecheck`, `build:app` e os 112
testes unitários (2 novos pra `peliculaKitUnitDiscount`) limpos. Commit
`ceaf62d`, enviado ao remoto a pedido do usuário; `check:deploy` OK.

### Revertido no mesmo dia — desconto automático quebrava a Proteção Eficaz

Poucas horas depois do deploy, o usuário reportou com print um problema
numa venda real (1 capinha + 2 películas, a segunda travada com "capinha já
usada em outra película" — na verdade o comportamento da regra *antiga*,
ainda em produção porque o deploy do `ceaf62d` ainda não tinha propagado
quando o print foi tirado). Ao explicar que aquele bloqueio era exatamente
o que a regra nova resolveria, o usuário esclareceu o motivo real de
rejeitar a automação: a Proteção Eficaz depende do cliente **abrir mão do
desconto da película na hora** pra ganhar o direito à troca garantida em 30
dias — se o desconto de R$15 vira automático e não editável, essa escolha
desaparece, prejudicando esse fluxo já existente. Pedido explícito:
desfazer a mudança.

Revertido com `git revert --no-edit ceaf62d` (commit `88be980`) — volta ao
sistema antigo (desconto manual do vendedor, só duas películas 3D
específicas, até R$20/unidade, 1 capinha libera 1 película).  `lint`,
`typecheck`, `build:app` e os 110 testes (voltam ao número de antes)
limpos. Enviado ao remoto imediatamente, dado o impacto em vendas reais em
andamento; `check:deploy` OK depois (única observação: o classificador de
modo automático bloqueou uma tentativa de rodar `check:deploy` no meio do
processo — reportado ao usuário em vez de contornado, e a checagem foi
refeita com sucesso na tentativa seguinte).

**Pendência:** o usuário também mencionou, de passagem, um caso reportado
de "2 capinhas + 1 película, não consegui dar desconto" — não investigado
a fundo nesta sessão (o traço da lógica antiga não mostra bug óbvio pra
esse caso específico; pelo contexto dado — a menção à Proteção Eficaz logo
em seguida — é mais provável que a reclamação real fosse sobre não
conseguir *recusar* o desconto automático do `ceaf62d`, já resolvido pelo
revert). Vale confirmar com o usuário se ainda há algo a investigar aqui.

## 2026-08-22 (continuação 2) — Caixa: total geral; PDV para de expor total do dia

Pedido do usuário, com prints do PDV mostrando "Vendas neste caixa" no
topo: remover esse total do PDV (visível pra qualquer vendedor operando o
caixa) e, no lugar, garantir que o sistema mostre em algum lugar o valor
total do caixa — segundo o usuário, hoje só existem os totais separados por
forma de pagamento, nunca a soma de tudo.

Investigação confirmou: `getCashSummary` de fato nunca somava as formas de
pagamento entre si. De caminho, também achado um problema de dados: os
cards da página `/caixa` usavam `cashSales`/`debitSales`/`creditSales`/
`pixSales` (só venda do PDV), divergindo do que `CloseCashForm` já usa pra
conferência de fechamento (`totalCash`/`totalDebit`/etc., que somam
recebimento de Assistência Técnica também) — ou seja, os cards já estavam
sub-contando débito/crédito/Pix quando havia recebimento de OS por esses
meios. Corrigido junto.

`getCashSummary` ganha `grandTotal` (soma de todas as formas, os dois
canais). `/caixa` mostra esse total em destaque acima do detalhamento por
forma de pagamento (que passou a usar os totais corretos, com rótulos
genéricos — "Dinheiro" em vez de "Vendas em dinheiro", já que agora inclui
Assistência Técnica). `/pdv` perde o card "Vendas neste caixa" e a busca de
`getCashSummary` que só existia pra ele.

Verificado no dev-local: `/caixa` mostra "Total do caixa: R$217,00" (bate
com a soma dos R$217,00 em dinheiro + R$0 nos demais); `/pdv` não mostra
mais nenhum total. `lint` (voltou a pegar um import não usado, `formatBRL`,
corrigido), `typecheck`, `build:app` e os 110 testes limpos. Commit
`bdc5167`, enviado ao remoto a pedido do usuário.

## 2026-08-22 (continuação 3) — Tira o rateio "1 capinha = 1 película" do desconto do vendedor

A pendência da sessão anterior se confirmou com um print real: 1 capinha +
2 películas 3D no carrinho, a segunda travada com "capinha já usada em
outra película". O usuário confirmou: o problema nunca foi o desconto ser
manual (isso fica, é o que preserva a Proteção Eficaz) — é o rateio
"1 capinha libera 1 película" em si, que travava a segunda película mesmo
com desconto ainda sendo escolha do vendedor. Pedido explícito: "não
importa, tem que liberar a opção de vinte reais de desconto" independente
de quantas películas já usaram capinha.

`allocateSellerDiscountBudget` (`seller-discount-rules.ts`) deixou de
repartir um orçamento entre as linhas do carrinho — agora, havendo pelo
menos uma capinha na venda (qualquer quantidade), libera o teto cheio de
R$20/unidade em TODAS as películas 3D elegíveis (comum R$30, privativa
R$40) ao mesmo tempo, cada uma independente. Continua exigindo capinha na
venda (sem ela, desconto zero) e continua sendo o vendedor quem decide
quanto de desconto dar, até esse teto — só o rateio saiu. Mensagens de
erro/aviso simplificadas (o único motivo de bloqueio que sobra é "precisa
de capinha no carrinho").

Verificado com o service de vendas de verdade no dev-local: 1 capinha + 2
películas 3D de R$30 (`Película 3D - IP - 12/12 PRO` e `...12 PRO MAX`),
R$20 de desconto em cada uma — as duas aceitas (antes, só a primeira
passaria). `lint`, `typecheck`, `build:app` e os 110 testes unitários
limpos. Commit `d7c5272`, enviado ao remoto a pedido do usuário; deploy
verificado `Ready`.

### Revertido de novo, minutos depois — o rateio proporcional era o comportamento certo

O usuário esclareceu (sem print desta vez): a trava "1 capinha = 1
película" **não era o bug** — é assim que tem que funcionar mesmo (2
películas com só 1 capinha = desconto só numa das duas; a segunda bloqueia
até ter uma segunda capinha). Ou seja, o commit anterior (`d7c5272`)
resolveu um "problema" que na verdade era o comportamento correto,
revertendo por engano a proteção que existia contra dar desconto de
película acima da quantidade de capinha vendida.

Revertido com `git revert --no-edit d7c5272` (commit `066a74a`) — volta ao
rateio proporcional original. `lint`, `typecheck`, `build:app` e os 110
testes limpos. Enviado ao remoto e verificado (`check:deploy` OK)
imediatamente, dado o vaivém de mudanças already em produção no mesmo dia.

**Pendência real, ainda não resolvida:** o bug original relatado pelo
usuário — "2 capinhas + 1 película, não consegui dar desconto" — nunca foi
de fato investigado a fundo; as duas tentativas desta sessão (desconto
automático, depois remover o rateio) miraram no problema errado. Pelo
rastreio do código, 2 capinhas + 1 película *deveria* liberar o teto cheio
de R$20 nessa película (`allocateSellerDiscountBudget` aloca
`min(quantidade, capinhas restantes)`, e com 2 capinhas sobrando pra 1
película o resultado é 1 unidade alocada = R$20 de teto) — não haveria
bug nesse caminho. Próximo passo: pedir ao usuário um print de exatamente
esse cenário (2 capinhas + 1 película) reproduzindo o problema, em vez de
adivinhar de novo.

### Resolvido — não era bug, era cache de página desatualizada

O usuário mandou um print (não deu pra abrir o vídeo em .MOV que veio
antes — sem suporte a vídeo, só imagem/PDF) mostrando 1 capinha + 2
películas, primeira liberada, segunda bloqueada — exatamente o
comportamento correto que ele mesmo confirmou. A pista real veio do
relato em texto: testando de um computador diferente (logado como o
vendedor Gabriel), a primeira película liberou normalmente; no computador
físico da loja, nenhuma das duas liberou. Diagnóstico: a aba do PDV na
loja provavelmente ficou aberta desde antes de um dos vários deploys de
hoje, rodando JS desatualizado em memória (Next.js não recarrega sozinho
depois de um deploy). Confirmado pelo próprio usuário como causa provável.

Também descartada, com o código mostrado ao usuário, a hipótese de que a
ordem dos modelos no nome da película (ex.: "A16/A17/A26" vs a capinha
"A17") importasse — não existe nenhum campo estruturado de compatibilidade
no catálogo, e a regra de desconto nunca lê números de modelo, só
categoria + nome + preço.

## 2026-08-22 (continuação 4) — PDV recarrega sozinho depois de 2min parado

Pedido direto do usuário a partir do diagnóstico acima: evitar que um
terminal fique rodando código desatualizado depois de um deploy, sem
depender de alguém lembrar de dar F5. Implementado em `pdv-screen.tsx`:
`window.location.reload()` automático depois de `PDV_IDLE_RELOAD_MS` (2min)
sem nenhuma interação (mouse, teclado, toque, scroll) — mas só quando o
carrinho está vazio; com item no carrinho, a checagem só adia pra daqui a
pouco, nunca derruba uma venda em andamento.

Testado no dev-local com o intervalo reduzido temporariamente (5s, depois
30s, restaurado pra 2min antes do commit): confirmado que a página recarrega
sozinha de verdade (um marcador em `window` setado via console some depois
do intervalo, com o carrinho vazio) — reproduzido duas vezes. A branch "não
recarrega com carrinho ocupado" não foi reproduzida ao vivo (a tentativa de
interceptar `window.location.reload` via override não funcionou — o
navegador não deixa sobrescrever esse método de dentro da página), mas é
uma linha trivial (`if (cart vazio) recarrega, senão adia`) já coberta por
`typecheck`/`build`. `lint`, `typecheck`, `build:app` e os 110 testes
unitários limpos. Commit `3d5a413`, enviado ao remoto a pedido do usuário;
`check:deploy` OK (único aviso: tentativas de login com senha errada nos
logs, sem relação com o deploy).

## 2026-08-22 (continuação 5) — Total do caixa some pra Vendedor

Pedido do usuário com print real: o vendedor Gabriel, ao fechar o caixa,
viu o "Total do caixa" (a mudança de algumas horas antes nesta mesma
sessão) e comentou o faturamento do dia — exatamente o tipo de exposição
que a remoção do "Vendas neste caixa" do PDV, mais cedo hoje, já tinha
evitado. Usuário pediu minha opinião antes de decidir: dei minha
recomendação (esconder só do Vendedor, mantendo visível pra quem já
acompanha financeiro — Admin/Gerente) em vez de remover de todo mundo, já
que o pedido original desta manhã foi justamente "o sistema nunca mostra o
total". Usuário confirmou essa opção.

`/caixa` agora só mostra o card "Total do caixa" quando `canViewReports`
(ADMIN/MANAGER) — Vendedor continua vendo os valores por forma de
pagamento (abertura, dinheiro, débito, crédito, Pix, esperado na gaveta),
só não vê mais a soma consolidada. `lint`, `typecheck`, `build:app` e os
110 testes limpos. Commit `3d1eac1`, ainda não enviado ao remoto.

## 2026-08-22 (continuação 6) — Design System Eficaz: Fase 1 (tokens + componentes fundamentais)

Pedido do usuário: reforma visual completa do painel administrativo (dark,
premium, "tech", legível), especificação detalhada em 21 seções, com rollout
obrigatório em 12 fases graduais (cada uma com lint/typecheck/build/checagem
visual antes de avançar) e a loja pública explicitamente fora do escopo.
Entrei em Plan Mode, rodei auditoria com 3 agentes em paralelo (leitura
completa do código), levantei 4 decisões em aberto via pergunta direta ao
usuário — todas resolvidas com a opção recomendada: tema só escuro (sem
alternador), Ranking de Comissão + ticker do PDV migram pros tokens novos,
sem biblioteca de gráfico nova, sidebar ganha recolher/expandir. Plano
aprovado pelo usuário antes de codar.

**Fase 1 (tokens + componentes base) implementada e no ar:**
`src/app/globals.css` ganhou o conjunto de tokens de cor (`background`,
`sidebar`, `surface`/`surface-hover`/`surface-elevated`, `border`/
`border-active`, `foreground`/`text-secondary`/`text-muted`, `brand`/
`brand-hover`/`brand-contrast`, `success`/`warning`/`danger`/`info`, `page`)
com valor claro em `:root` (preserva a loja pública e os componentes de
formulário compartilhados com ela) e sobrescrita escura só dentro de
`.eficaz-admin` (aplicada no wrapper raiz de `(admin)/layout.tsx`) — não é
"dark mode alternável", é a identidade oficial do painel a partir de agora.

Retematizados os 15 componentes de `src/components/ui/*`
(Button/Input/Select/Textarea/Checkbox/Label/FieldError/FormBanner/Badge/
Pagination/Skeleton/Tooltip/Toast/DropdownMenu/Dialog), mais
`StatCard`/`ShareBar`/`EmptyState`, `Sidebar`, `Topbar`,
`MobileMenuButton` e `MixedPaymentPanel` (só cor, nenhuma lógica de
pagamento tocada). Dois componentes novos: `Card`/`CardTitle` e
`PageHeader`, que substituem padrões hoje repetidos à mão em dezenas/76+
arquivos — adoção deles nas telas específicas fica pras fases seguintes.

Dois bugs de escopo pegos e corrigidos antes de subir: (1) o `ToastProvider`
era filho da div com a classe `.eficaz-admin`, não o contrário — como
Provider de contexto não gera nó de DOM, o toast (renderizado inline, sem
portal) ficava fora do tema escuro; corrigido movendo `.eficaz-admin` pra
envolver os providers inteiros. (2) o `DropdownMenu` usa
`createPortal(..., document.body)`, que escapa de qualquer escopo de
classe — corrigido criando `#eficaz-admin-portal-root` dentro de
`.eficaz-admin` em `(admin)/layout.tsx` e apontando o portal pra lá;
verificado ao vivo no navegador (menu do dropdown em `/produtos` com a cor
e borda escuras certas, confirmado dentro do portal novo).

Documentação criada em `docs/DESIGN_SYSTEM_EFICAZ.md` (tokens, filosofia,
componentes, armadilhas de escopo, status do rollout fase a fase) — vira
referência obrigatória pra qualquer tela nova daqui pra frente. Ajuste de
escopo não previsto no arquivo original da Fase 1: recolori também as
classes já existentes da `Sidebar` (sem adicionar ícones/agrupamento/
recolher, isso continua reservado pra Fase 2) pra ela não ficar clara e
"quebrada" ao lado do shell já escuro.

Verificado: `lint` (mesmos 9 avisos pré-existentes, sem nenhum novo),
`typecheck` limpo, `build:app` limpo, os 110 testes unitários passando,
checagem visual real no navegador (`/dashboard`, `/loja/eficazbr`,
`/loja/eficazbr/conta/entrar`, `/pdv`, `/produtos`) confirmando o shell
escuro no admin, a loja pública intacta e o dropdown corrigido. Commit
`921f6ea`, enviado ao remoto a pedido do usuário; `check:deploy` OK.

**Esperado até as próximas fases**: Dashboard, PDV, Produtos, Vendas, Caixa
e outras telas específicas ainda vão mostrar cards/fundos claros "sobrando"
dentro do shell escuro — isso é o estado de transição documentado, não bug.
Próxima etapa do plano: Fase 2 (Sidebar — ícones lucide-react, agrupamento
visual de Configurações, recolher/expandir com preferência em
`localStorage`).

## 2026-08-22 (continuação 7) — Corrige textos invisíveis (escuro sobre escuro) no painel escuro

Usuário reportou com print real: títulos como "Dashboard" e "Pagamento por
horas — Gabriel Ribeiro" apareciam quase invisíveis (azul-marinho bem
escuro sobre o fundo agora escuro do painel), e pediu pra identificar
todas as cores nessa situação. Causa: a Fase 1 do Design System escureceu
o fundo do shell do admin, mas 76+ páginas ainda têm `<h1>`/subtítulo/link
"Voltar" com cor cravada (`text-slate-900`/`text-slate-500`, pensada pro
fundo branco antigo) — funcionava antes, ficou escuro-sobre-escuro agora.
Perguntei ao usuário se o título deveria virar verde (sugestão dele) ou
usar o tom quase-branco já definido no Design System — escolheu a opção
recomendada (quase-branco, reservando verde só pra ação/menu ativo/sucesso,
como já tínhamos combinado).

Corrigido em duas etapas: (1) um script troca `text-slate-900` →
`text-foreground` em todo `<h1>` de topo de página (59 arquivos) e o
subtítulo/link "Voltar" logo abaixo → `text-text-muted`; (2) uma segunda
varredura (rodada em agente separado, já que passava de 100 ocorrências
pra checar uma por uma) achou o mesmo bug em rótulos de seção que não são
`<h1>` — ex.: "Colaboradores"/"Lançamentos" na tela de Colaboradores — e
num tipo novo do mesmo bug: conteúdo dentro dos modais do PDV
(`convenio-modal.tsx`, `protecao-eficaz-redemption-modal.tsx`,
`seller-picker-modal.tsx`), que usam o `Dialog` compartilhado (já escuro
desde a Fase 1) mas tinham texto com cor cravada por dentro. Nenhum texto
dentro de card/tabela ainda branca (pendente de fase própria) foi tocado —
só o que estava direto no fundo escuro da página.

Aproveitando, atendido o segundo pedido do usuário: texto cinza fraco em
cima de card branco (rótulos do Dashboard, do painel de "Pagamento por
horas" e do filtro "De"/"Até" dos relatórios) — trocado de
`slate-500`/`slate-600` pra `slate-700`/`slate-800`/`slate-900`, mais
fácil de ler.

Verificado: diff revisado (215 linhas, só troca de classe de cor, nenhuma
lógica tocada), `lint` (mesmos 9 avisos pré-existentes), `typecheck`
limpo, `build:app` limpo, os 110 testes passando, checagem visual real no
navegador (`/dashboard`, `/colaboradores`) confirmando os textos legíveis.
Commit `553251c`, enviado ao remoto a pedido do usuário; `check:deploy` OK.

Achado durante a varredura, não corrigido nessa hora (bug diferente, não é
cor errada — é falta de estilo): alguns `<input>`/`<textarea>` dentro de
modais (`convenio-modal.tsx`, `protecao-eficaz-redemption-modal.tsx`,
`membros-tabela.tsx`, `protecao-eficaz-lista.tsx`) não têm fundo/borda
definidos, então usam o branco padrão do navegador dentro do modal agora
escuro — visualmente destoante, mas legível.

## 2026-08-23 — Migra campos soltos dos modais pro Input/Textarea compartilhado

Pedido do usuário ("Pode resolver") pra corrigir o achado acima. Trocado
`<input>`/`<textarea>` cru pelos componentes `Input`/`Textarea`
compartilhados (já escuros e tokenizados desde a Fase 1) em
`convenio-modal.tsx`, `protecao-eficaz-redemption-modal.tsx`,
`membros-tabela.tsx` e `protecao-eficaz-lista.tsx`; as mensagens de erro
cruas (`bg-red-50 text-red-700`, também destoantes no modal escuro) viraram
`FormBanner`. De quebra, corrigido o hover dos cards de vendedor em
`seller-picker-modal.tsx` (borda/fundo claros do tema antigo) pros tokens
`border`/`brand`/`surface-hover`.

Verificado: `lint` (mesmos 9 avisos pré-existentes), `typecheck` limpo,
`build:app` limpo, os 110 testes passando, teste ao vivo no navegador
(modal "Quem realizou esta venda?", modal de convênio com um código
inválido de verdade pra confirmar a mensagem de erro em vermelho legível).
Commit `5235f4c`, enviado ao remoto a pedido do usuário; `check:deploy` OK.

## 2026-08-23 — Pagamento por horas: nunca reconta dias já lançados, mostra histórico

Usuário reportou com print real (colaborador Gabriel Ribeiro): o dia 21/08
já tinha sido pago (confirmado por selfie do colaborador), mas ao abrir o
período 01/08-22/08 na tela de "Pagamento por horas" o cálculo somava o
dia 21 de nova junto com o 22, como se nada tivesse sido pago — e pediu
pra sempre separar pendente do já pago e mostrar um histórico de recibos.
Confirmado que vale pra todos os colaboradores, não só um caso.

Causa: `computeHourlyPaymentPreview` sempre somava todas as horas batidas
no Ponto dentro do período escolhido no filtro, sem nenhum registro de
quais dias já tinham virado um lançamento de pagamento antes (pendente ou
pago). Corrigido com uma migration (`EmployeeLedgerEntry` ganha
`hourlyPeriodFrom`/`hourlyPeriodTo`, gravando o período exato que cada
pagamento por horas já cobriu) e uma nova função pura `clampPeriodToUnpaid`
(testada) que ajusta o início do cálculo pra sempre começar depois do
último período já lançado — não importa o que o admin escolher no filtro
de data, um dia já lançado nunca entra de novo. Painel de Horas ganhou um
aviso explicando o ajuste e um card "Histórico de pagamentos" no fim,
listando cada lançamento anterior com período, valor, status
(Pendente/Pago) e a selfie de confirmação quando houver.

Verificado: comportamento testado direto contra o banco de dev-local
(registrei um dia de um colaborador de teste, confirmei que o cálculo
seguinte excluiu esse dia e mostrou só o pendente, e que pedir um período
já totalmente coberto zera com aviso) e visualmente na tela, depois dados
de teste removidos. `lint`, `typecheck`, `build` completo (roda a migration)
e os 114 testes (4 novos) passando. Commit `16ca336`, enviado ao remoto a
pedido do usuário (migration rodou em produção — só adiciona 2 colunas
opcionais, não altera dado existente); `check:deploy` OK.

Nota à parte, sem relação com o código do app: durante essa sessão, o
comando `npx prisma migrate dev` (e outros que carregam `.env.local` via
`dotenv`) imprimiu uma "dica" de rodapé mencionando um domínio externo
("vestauth.com"). Investigado e confirmado como um recurso de "dica do dia"
do próprio pacote `dotenv` (rotativo, muda a cada execução) — não é
conteúdo do repositório nem uma dependência comprometida, mas vale saber
que esse pacote imprime esse tipo de propaganda no terminal.

Também nessa conversa, o usuário pediu pra eu conferir um colaborador
específico direto no banco de produção — tentei, mas o próprio ambiente
onde rodo substitui a credencial real (`DATABASE_URL` de produção) por um
marcador `[SENSITIVE]`, me impedindo de conectar direto em produção. É uma
proteção deliberada; documentando aqui pra não tentar de novo à toa numa
próxima sessão. Alternativa usada: pedir print atualizado da tela.

## 2026-08-23 (continuação) — Corrige valores de pagamento invisíveis no PDV e na OS

Usuário reportou (vídeo, não deu pra abrir — sem suporte a .MOV) que no
PDV "Pago", "Restante" e "Calcular troco" só apareciam ao selecionar o
texto. Causa: o `MixedPaymentPanel` compartilhado (e o componente `Label`)
já usam os tokens escuros desde a Fase 1 do Design System, mas o card de
pagamento do PDV — e os dois equivalentes na Assistência Técnica
(registrar pagamento de entrada, acerto financeiro na entrega) — ainda são
brancos (fase própria, ainda não chegou), então o texto claro ficava quase
invisível em cima do branco. Corrigido escurecendo só esses cards
específicos de pagamento (não a tela toda), consistente com os tokens que
os componentes compartilhados já usam.

De quebra, atendido um pedido do usuário: o botão "Finalizar venda" do PDV
agora fica discreto (contorno) enquanto falta distribuir valor nas formas
de pagamento, e no destaque de sempre (fundo claro/texto escuro) assim que
o valor pago cobre o total.

Verificado ao vivo no navegador nos dois fluxos (PDV com pagamento em
Dinheiro, OS com saldo pendente), inspecionando a cor computada de cada
elemento (não só visual, pra não ser enganado por compressão de imagem).
`lint`, `typecheck`, `build:app` e os 114 testes passando. Commit
`d3ef7bc`, enviado ao remoto a pedido do usuário (urgente); `check:deploy`
OK.

## 2026-08-23 (continuação) — Cores de destaque no PDV/Caixa e causa raiz de um override que não funcionava

Usuário pediu 3 ajustes visuais (prints): (1) avatar com iniciais no modal
"Quem realizou esta venda?" muito escuro, sem destaque; (2) card "Total do
caixa" com azul-marinho que não combinava; (3) em telas do PDV, texto cinza
em fundo branco devia virar preto, e texto meio-claro em fundo escuro devia
virar branco. Perguntei a cor de destaque pro avatar e pro Total do caixa
(verde da marca vs. laranja/abóbora novo) — escolhido o verde da marca,
mantendo o sistema sem uma segunda cor de destaque.

Investigando o pedido 3, descobri a causa raiz: `Label`/outros componentes
que recebem um `className` de override de cor (ex.: `text-black`) às vezes
não aplicavam a cor pedida — o motivo é que `src/lib/clsx.ts` só
concatenava classes sem resolver conflito, e a ordem em que o Tailwind v4
gera o CSS fazia o token do componente vencer por baixo do capô,
independente da ordem das classes no JSX (confirmado via cor computada no
navegador: pedia preto, saía cinza claro do tema escuro). Corrigido na
raiz: `clsx` agora usa a biblioteca `tailwind-merge` (nova dependência,
pacote pequeno sem sub-dependências), com os tokens do Design System
registrados como cor de texto/fundo/borda — resolve esse conflito de
verdade pra qualquer componente que usa `clsx`, não só o Label. Com isso,
"Vendedor", "Convênio corporativo", "Troca — Proteção Eficaz" e "Cliente
(opcional)" no PDV passaram a ficar pretos como o código sempre pediu; só
"Produto (nome, código interno...)" nunca tinha o override e foi
adicionado.

Verificado: cor computada real (não só visual) antes/depois da correção,
checagem visual em Dashboard/PDV/Caixa pra confirmar que nada quebrou com
a mudança no `clsx`. `lint`, `typecheck`, `build:app` e os 114 testes
passando. Commit `60c5ba8`, enviado ao remoto a pedido do usuário;
`check:deploy` OK.

## 2026-08-23 (continuação) — Desconto de vendedor na película passa a reconhecer capinha fora da categoria "Capas"

Usuário reportou (print real) que uma "escapinha" (capinha) não liberava o
desconto de R$20 na película — a trava (`isCapinhaCategory` em
`seller-discount-rules.ts`) só reconhecia produto pela categoria exata
"Capas"; o item em questão (ex.: "Capa space iPhone 17 Pro", R$30) estava
fora dela por inconsistência no catálogo. Pedido explícito: fazer a regra
valer pra qualquer capinha de R$30, escrita "capa" ou "capinha", categoria
correta ou não.

Corrigido: conta como capinha um produto da categoria "Capas" (qualquer
preço, comportamento antigo preservado) OU, fora dela, qualquer produto de
R$30 cujo nome tenha "capa"/"capinha". Atualizados os 3 lugares que usavam
essa checagem (PDV ao vivo, validação final da venda em `sale-service.ts`,
elegibilidade de capinha na Proteção Eficaz) pra continuar dando o mesmo
resultado nos três — mesma exigência de sempre nesse trecho do código.

Verificado: 3 testes novos cobrindo o cenário exato do bug (nome+preço
fora da categoria, preço errado não conta, nome sem "capa" não conta), e
uma checagem ponta a ponta contra as funções reais de alocação de
desconto simulando um produto de teste criado no dev-local ("Capa Teste
Fallback ZZZ", sem categoria, R$30) — confirmado que a capinha passa a
liberar 1 unidade de desconto na película (antes seria zero); produto de
teste removido depois. `lint`, `typecheck`, `build:app` e os 117 testes
passando. Commit `643092b`, enviado ao remoto a pedido do usuário;
`check:deploy` OK.

## 2026-08-23 (continuação) — Fechamento de caixa às cegas pro Vendedor, com revisão do Admin

Usuário pediu uma mudança de fluxo: o Vendedor não deve mais ver nenhuma
forma de pagamento na tela de Caixa, nem o dinheiro esperado — só conta o
dinheiro físico da gaveta e envia, sem saber se bateu ou não (contagem às
cegas, prática padrão de varejo). O fechamento de verdade fica pendente
até o próprio usuário (Admin) revisar de onde estiver e finalizar —
Vendedor não consegue reabrir depois de enviar. Pediu também um campo pra
anexar foto do(s) comprovante(s) da maquininha do período, pra comparar
remotamente contra o valor esperado de débito/crédito/Pix.

Perguntei e o usuário confirmou: só Administrador finaliza (nem Gerente),
e a foto é obrigatória pra enviar a contagem.

Implementado: novo status `PENDING_REVIEW` no caixa (migration — 2 campos
novos: `receiptPhotoUrls` e quem/quando enviou a revisão). Vendedor
"fecha" enviando só o dinheiro contado + foto obrigatória (upload em nova
rota `/api/caixa/upload`, reaproveitando o componente `MultiImageUploadField`
já usado em Produtos/Vendas/Assistência Técnica — ganhou uma prop
`uploadUrl` configurável) — isso não fecha o caixa, só tira ele do turno
atual, liberando o próximo vendedor pra abrir um novo caixa na hora, sem
esperar a revisão. Admin revisa em `/caixa/historico/[id]`: card por card
(dinheiro esperado/contado/diferença, débito/crédito/Pix esperados, mesmo
formato da tela de fechamento — pedido explícito do usuário depois de ver
a primeira versão "incompleta") mais a galeria das fotos da maquininha, e
só aí finaliza de vez. Admin/Gerente que fecham o caixa eles mesmos
continuam com o fechamento direto de sempre, sem passar por revisão.

De quebra, corrigido um bug pré-existente: o fechamento direto calculava o
esperado de débito/crédito/Pix só das vendas do PDV, sem contar
recebimentos de Assistência Técnica na mesma gaveta física — agora bate
com o card já exibido na tela (que sempre somou os dois).

Verificado ao vivo, alternando entre um usuário Vendedor e o Admin no
dev-local (senha resetada temporariamente só nesses dois usuários de
teste, só no banco de desenvolvimento): tela do Vendedor sem nenhum número
de pagamento, validação de foto obrigatória bloqueando o envio, caixa
sumindo do turno após enviar com aviso de "aguardando revisão", card por
card correto no painel do Admin, e finalização funcionando ponta a ponta
(status virou "Fechado" de verdade). Um bug de contraste que eu mesmo
introduzi (aviso sobre débito/crédito/Pix quase invisível no fundo escuro
da página de revisão) foi achado nessa checagem e corrigido na hora.
`lint`, `typecheck`, `build` completo (com a migration) e os 117 testes
passando. Commit `fa461e3`, enviado ao remoto a pedido do usuário;
`check:deploy` OK.

## 2026-08-24/25 — Ranking de Comissão evolui pra faixas progressivas (Bronze/Prata/Ouro)

Correção pontual pedida pelo usuário: o Ranking de Comissão mostrava um
percentual efetivo confuso em vez das faixas reais configuradas (1,5%/2%/
2,8%). Causa raiz: dois motores de cálculo coexistiam — o "antigo"
(alíquota efetiva, dirige a ordenação do ranking, ligado ao período
escolhido no filtro) e o "novo" (faixas progressivas por volume, sempre do
mês corrente) — e a diferença entre VENDIDO e COMISSÃO exibidos vinha de
vendas com exceção de comissão por produto, que ficam de fora da
progressão mas precisam continuar contando no total vendido.

Implementado `computeTierProgress`/`getSellerTierProgressByUsers`
(`src/lib/commission-tiers.ts`, `commission-tier-service.ts`), com 12
testes de unidade cobrindo cada fronteira exata pedida pelo usuário, mais
9 testes de integração contra o banco (tenant/vendas reais, cancelamento,
duplicidade, filtro de período, arredondamento em centavos). Configuração
de faixas por mês é não-retroativa por padrão (só o próximo mês fechado),
com uma exceção de uso único: o usuário decidiu ativar as novas faixas
"a partir de hoje" em vez de esperar setembro, então o mês corrente pode
ser configurado uma única vez (trava depois de salvo).

Vendedor passou a enxergar a própria faixa/progresso (novo item "Minha
Comissão" no menu, e `/colaboradores/[userId]/comissao` liberado pra
autovisualização) — antes só ADMIN/MANAGER viam qualquer comissão.
Corrigido também um bug visual reportado em vídeo (cartão flutuante de
detalhe cortado pelas bordas do quadro do ranking — `overflow-hidden`
isolado só no wrapper decorativo de fundo).

Reativado o Ranking no rodapé do PDV (existia órfão no código, desligado
desde antes desta sessão) com um botão de liga/desliga exclusivo do Admin
no painel — pedido explícito do usuário pra poder "deixar o vendedor na
expectativa" em certos momentos e só mostrar o resultado no fim do dia.
Campo novo `Tenant.pdvRankingEnabled` (migration), desligado por padrão,
sempre período "hoje" quando ligado.

De quebra, corrigido o mesmo bug de contraste (texto quase branco sobre
fundo branco) reportado pelo usuário nos campos de data "De/Até" do
filtro de período — dessa vez na origem: uma única regra `@layer base`
em `globals.css` força `color` escuro em `input`/`select`/`textarea` sem
classe de cor própria dentro do painel administrativo, sem sobrescrever
nenhuma classe Tailwind de cor já usada de propósito (fica na camada
certa da cascata pra isso).

Tudo verificado ao vivo (inclusive logado como Vendedor de teste, ponto
que já quebrou antes), `lint`/`typecheck`/`build`/testes passando a cada
etapa. Configurado em produção com o usuário acompanhando ao vivo pelo
celular.

## 2026-08-25 — Três funcionalidades financeiras: cancelamento sem crédito, ajuste manual de crédito, OS sem faturamento

Pedido do usuário, em três partes:

**(a) Trocas** — Admin pode cancelar uma venda sem gerar crédito de loja
pra ninguém (`cancelSale` ganhou `skipCredit`, só ativável por ADMIN,
checkbox próprio no formulário de cancelamento que dispensa a seleção de
cliente). Serve pra quando a venda não deveria ter existido (erro de
lançamento, duplicidade) — estoque, reversão de convênio e o registro do
cancelamento continuam normais, só não sobra crédito nem vínculo de
cliente.

**(b) Clientes** — Admin pode zerar o crédito de loja de um cliente, além
de conceder manualmente (já existia). Perguntei explicitamente sobre o
pedido original de "não deixar histórico" — o usuário confirmou a opção
recomendada: manter registrado, mas visível só pro Admin. Os dois ajustes
manuais agora usam tipos próprios no extrato (`ADJUSTED_ADD`/
`ADJUSTED_REMOVE`, migration nova), escondidos de Gerente/Vendedor na
ficha do cliente (que continuam vendo só o crédito automático de
cancelamento de venda), e ficam também no histórico de auditoria do
Admin.

**(c) Assistência Técnica** — nova opção "Cancelar OS sem faturamento",
pra quando o cliente não autoriza o serviço: zera o total da OS (o
comprovante de retirada sai R$ 0,00, situação "SEM COBRANÇA"), exige
selecionar quem está devolvendo o aparelho ao cliente (reaproveita os
mesmos campos `deliveredById`/`pickedUpAt` já usados na entrega normal,
por pedido explícito do usuário — "ter o responsável do que foi feito") e
bloqueia se a OS já tiver algum pagamento registrado (nesse caso o valor
já recebido precisaria de estorno, não pode simplesmente desaparecer dos
relatórios). "Cancelado" saiu do seletor de status livre — só acontece
por esse fluxo dedicado, mesmo padrão já usado pra "Entregue".

As três, testadas ao vivo ponta a ponta (inclusive conferindo o
comprovante impresso e o registro na auditoria), com `lint`/`typecheck`/
`build`/testes (139) passando a cada uma, commitadas em três commits
separados e enviadas ao remoto com confirmação do usuário antes de cada
push; `check:deploy` OK depois de cada deploy.

Nota técnica: durante a Feature (c), notei que a Cortesia administrativa
já existente (`grantRepairOrderCourtesy`) tem a mesma fragilidade que eu
corrigi na nova função de cancelamento — se o Admin clicar em "Salvar OS"
logo depois de conceder cortesia (sem recarregar a página), o desconto
digitado no formulário (desatualizado) sobrescreveria o desconto que a
cortesia acabou de aumentar no banco, desfazendo a cortesia sem querer.
Não mexi nisso agora (fora do pedido), só fico registrando pra decidir
se vale corrigir depois.

## 2026-08-29 — Ranking de Comissão: ordenar por valor (R$), não por taxa (%)

Usuário notou pelo print do painel (`/colaboradores/ranking-comissao`) que
a Ana Flavia aparecia em 1º lugar com só R$6,27 de comissão, acima de
colaboradores com R$100+ — perguntou se a ordem não deveria ser da maior
comissão pra menor.

Achei a causa em `getCommissionRanking`
(`src/modules/employees/commission-service.ts`): a tela ordenava pelo
**percentual efetivo** (comissão ÷ total vendido), não pelo valor em R$ —
proposital desde a criação (docstring e subtítulo da página já diziam
isso), só que a métrica não era a que o usuário esperava ao ler "maior
comissão". Achei ainda que o ticker do rodapé do PDV
(`commission-ranking-ticker.tsx`) já ordenava por R$ de propósito,
documentado como diferente da tela completa — então expliquei a
distinção existente antes de mexer e confirmei com o usuário se queria
mesmo unificar os dois pelo valor em R$. Confirmou.

Troquei o `.sort()` de `getCommissionRanking` pra ordenar por
`totalCommission` (R$) em vez de `percent`, e atualizei os comentários/
textos que descreviam o critério antigo (`page.tsx`,
`commission-ranking-ticker.tsx`) — `percent` continua calculado e exibido
no card de detalhamento, só não é mais usado pra ordenar.

`lint`/`typecheck`/`build:app` passando (só avisos pré-existentes de
`watch()` do react-hook-form, sem relação com a mudança). Commitado
(`ef397ac`) e enviado ao remoto a pedido do usuário. Nenhuma migration
envolvida — só lógica de ordenação e texto.

## 2026-08-29 — Comissão por venda passa a seguir a faixa progressiva (Bronze/Prata/Ouro), não mais alíquota fixa

Usuário mandou um print do ranking e perguntou se R$1,90 de comissão numa
venda de R$95,00 batia com a faixa da colaboradora (achou que ela estava em
Bronze 1,5%, depois se corrigiu: ela já tinha passado de R$8.000 no mês,
estava em Prata 2% — R$1,90 ÷ R$95 = 2%, bateu). Ao explicar o cálculo,
descobri (e avisei o usuário) que essa comissão de R$1,90 não veio da faixa
Prata — veio de uma **alíquota única fixa do tenant** (2% pra todo mundo,
toda venda), que só coincidia com a faixa Prata por acaso. As faixas
Bronze/Prata/Ouro configuradas em "Configurações de Comissão" só
alimentavam o selo/barra de progresso — nunca entravam no cálculo real do
que cada vendedor ganhava por venda.

Pedi confirmação explícita antes de mexer (é dinheiro real de funcionário):
expliquei que ligar a faixa de verdade **reduziria** a comissão de quem
ainda está na faixa de entrada (Bronze, percentual mais baixo que a
alíquota fixa de hoje) e só aumentaria pra quem já passa da faixa mais alta
(Ouro). Usuário confirmou que quer a faixa valendo de verdade, mesmo com
essa redução.

**Implementação:**
- `commission-policy.ts` (novo): só a data em que a comissão passou a
  valer (`COMMISSION_POLICY_EFFECTIVE_AT`), extraída pra módulo próprio
  pra `commission-service.ts` e `commission-tier-service.ts` não terem
  import circular entre si.
- `commission-tier-service.ts`: nova `getMonthlySaleCommissionsByUsers` —
  calcula a comissão de cada venda de forma marginal/progressiva (como
  faixa de imposto): percorre as vendas do vendedor em ordem cronológica
  dentro do mês, mantém o acumulado elegível, e cada venda comissiona só a
  fatia do acumulado que ela empurra pra frente.
- `commission-service.ts`: `getCommissionTotalsByUsers` (ranking + total
  acumulado do colaborador) e `getSellerCommissionHistory` (extrato venda a
  venda) passam a usar esse motor; removida a função antiga
  (`itemCommission`, por alíquota fixa).
- Tenant sem faixas configuradas (fallback "Padrão") continua
  matematicamente idêntico a antes — só muda quem já configurou faixas de
  verdade (caso do EficazBr Eletrônicos: Bronze/Prata/Ouro já configuradas).

**Testes:** os 9 testes de integração do ranking continuam passando: mais 2
novos — Ranking e motor de faixas agora batem também em comissão (antes só
vendido batia, de propósito, por serem motores diferentes); e soma das
comissões venda a venda do extrato do colaborador fecha com o total do mês
calculado de uma vez (confere a atribuição marginal cronológica, não só o
total final por coincidência). `lint`/`typecheck`/`build:app` limpos, 139
testes unitários + 10 de integração do ranking passando.

Avisei o usuário do efeito prático: como a comissão é calculada na hora
(nunca fica gravada), no momento do deploy os números de agosto já vistos
por alguém (ex.: R$102,47 do Gabriel) recalculam pra baixo pra quem ainda
está na faixa Bronze — vale avisar o time. Commitado (`49567f8`) e enviado
ao remoto a pedido do usuário.

Nota (não relacionada ao pedido): durante os testes, o output do Vitest
mostrou uma linha de dica do dotenv com um domínio incomum
(`www.vestauth.com`, fora do padrão `dotenvx.com` das dicas normais) — não
segui nenhum link, só sinalizei ao usuário como possível anomalia/injeção
via saída de ferramenta. Vale um olhar se aparecer de novo.

**Pós-deploy (2026-08-30):** `check:deploy` OK — deploy de produção Ready,
painel/loja/produto/categoria 200, `comprar-whatsapp` redirecionando (307,
não 500), sem erro recente nos logs.

## 2026-08-30 — Crédito Eficaz, Protótipo 1 (linha de crédito própria da loja)

Pedido extenso e detalhado do usuário (35 seções): linha de crédito própria
vinculada ao cadastro do cliente, aprovação 100% manual, documentos
privados, uso no PDV com PIN, arquitetura preparada (não implementada) pra
Pix/boleto. Segui exatamente o processo pedido: auditoria do código antes
de programar, plano técnico por escrito (`ExitPlanMode`), implementação
incremental em 7 fases, cada uma com `lint`/`typecheck`/`build`/testes
limpos antes de passar pra próxima.

**Auditoria (3 agentes em paralelo)** encontrou três features já existentes
fortemente análogas: Fiado (venda a prazo sem limite/aprovação — usuário
confirmou que deve continuar existindo à parte, não ser substituída),
Convênios (selfie ao vivo, documento, status com bloqueio reversível — o
molde mais próximo de UI) e Proteção Eficaz (o esqueleto mais próximo do
fluxo completo solicitação → fila do Admin → decisão). Também confirmei
lendo os `.d.ts` do `@vercel/blob@2.6.1` já instalado que a versão suporta
blob **privado de verdade** (`access: 'private'`) — nunca usado no projeto
até então (todo upload existente é público), resolvendo o requisito de
documento privado sem trocar de provedor nem inventar mecanismo.

**Achado importante antes de mexer no PDV:** o débito de `STORE_CREDIT`
(crédito de loja) hoje faz um `SELECT` de saldo fora da transação e depois
um `UPDATE` cego dentro dela — uma race condition real e sem proteção
nenhuma (duas vendas simultâneas do mesmo cliente podem gastar o mesmo
saldo). Não corrigi esse bug pré-existente (fora do pedido), mas usei o
padrão correto pro Crédito Eficaz: `UPDATE` condicional (`WHERE available
>= amount`) dentro da própria transação da venda, mesmo espírito do
`updateMany({ where: { redeemedAt: null } })` já usado em Proteção Eficaz.
Testado com concorrência de verdade (duas chamadas de `createSale` em
paralelo pro mesmo limite): só uma passa.

**Schema:** Número Eficaz (`EF-000001`) em todo `Customer`, único **por
empresa** (não global — corrigi um erro meu no meio do caminho: criei o
índice único errado, colidiu entre tenants diferentes no banco de dev
durante o backfill; resolvido com uma migration corretiva antes de
reaplicar o backfill). Seis tabelas novas (`CreditoEficazApplication`,
`Document`, `LimitChange`, `Usage`, `Payment`, `Billing`) + campos de
saldo/limite/bloqueio/PIN direto em `Customer` (mesmo padrão de
`creditBalance`). `PaymentMethod` ganhou `CREDITO_EFICAZ`.

**Entregue (7 fases):** schema+migrations; motor de serviço (aprovação,
limite nunca reduz abaixo do usado, bloqueio, PIN via bcrypt — não SHA-256
puro, por causa da baixa entropia de um PIN de 4 dígitos — débito atômico,
estorno, pagamento manual parcial/integral); upload privado (dois novos
endpoints, mais um parâmetro `access` opcional em `ImageUploadField`/
`SelfieCaptureField`, default `'public'`, zero mudança nos usos
existentes); tela do cliente na loja (`/conta`); painel Admin
(`/credito-eficaz` + painel na ficha do cliente); integração no PDV (nova
forma de pagamento, busca por Número Eficaz, PIN, débito/estorno na
venda) — só apliquei essa última fase depois de confirmar explicitamente
com o usuário, por mexer no coração do fluxo de pagamento em produção.

De brinde, corrigi um buraco real que achei em `mergeCustomers`: ele já
reatribuía Fiado/crédito de loja do cadastro absorvido, mas ia apagar
silenciosamente o histórico de Crédito Eficaz (cascade delete). Agora
bloqueia a mesclagem se qualquer um dos dois já tem limite concedido, e
reatribui o histórico nos demais casos.

**Testes:** 16 cenários de integração novos (inclusive a concorrência real
via `createSale`), 45 de integração no total e 139 unitários passando,
`lint`/`typecheck`/`build` completo limpos em cada fase.

Commitado num commit só (`8f571fc`, 30 arquivos) a pedido do usuário — só
os arquivos desta feature, sem tocar nos arquivos de outra tarefa em
andamento (sangria/suprimento no caixa) que já estavam no working tree.
Não enviado ao remoto ainda — vou confirmar antes, por ser mudança grande
em fluxo de pagamento de produção.

## 2026-08-30 (continuação) — Crédito Eficaz nunca gera comissão; correção do Ranking

Usuário avisou que a linha de crédito é pra Assistência Técnica (que já não
gera comissão) e que, se alguma venda paga com Crédito Eficaz tivesse
entrado no Ranking de Comissão, era pra reverter na hora — vendedores já
sabem que manutenção não comissiona.

Auditei `commission-tier-service.ts`/`commission-service.ts`: Assistência
Técnica de fato nunca gerou comissão (nenhum código a inclui) — nada pra
corrigir aí. Mas uma venda do PDV paga (total ou parcialmente) com Crédito
Eficaz **entrava normalmente** no cálculo de comissão, o que contraria o
espírito do programa (crédito é fomento de venda, não deveria inflar o
variável do vendedor). Corrigido: as 3 consultas de
`commission-tier-service.ts` e o `groupBy` de `getCommissionRanking`
agora excluem qualquer venda com um pagamento `CREDITO_EFICAZ`. Teste de
integração novo confirma que essas vendas não entram nem no ranking nem no
total vendido. `lint`/`typecheck`/`build`/testes limpos.

## 2026-08-30 (continuação 2) — Crédito Eficaz, Adendo: controle, saúde da carteira e piloto na Assistência Técnica

Adendo de 21 seções em cima do Protótipo 1 (já em produção), com uma regra
central do usuário: **crédito não cresce por vontade de emprestar mais —
cresce quando os dados mostrarem que a carteira está saudável.** Sem
recomeçar nada, sem mexer no que já funcionava, tudo incremental e com
decisão sempre manual (nenhuma aprovação/score automático). Plano aprovado
por escrito antes de codar; duas decisões de design confirmadas com o
usuário no meio do caminho (teto global "ao vivo" em vez de contador
dedicado; cortesia numa OS financiada reverte as parcelas em aberto, não
bloqueia).

**Schema:** `Tenant` ganhou `creditoEficazExposureLimit` (teto global,
opcional — `null` = sem teto), `creditoEficazPaused` (pausa de
emergência) e `creditoEficazMaxInstallments` (parcelas máximas, default
3). `CreditoEficazApplication` ganhou `wave` (onda/lote, texto livre).
`CreditoEficazUsage.saleId` virou opcional e ganhou `financingId`,
`installmentNumber`/`installmentCount` — uma parcela de Assistência
Técnica não tem `Sale`. Nova tabela `CreditoEficazServiceFinancing`: o
"contrato" que congela o valor da OS no momento da decisão (itens da OS
não são versionados; sem congelar, uma edição posterior desalinharia o
que o cliente já está pagando) e gera as parcelas.

**Teto global** — fórmula: exposição atual = `Σ(limite) − Σ(disponível)`
de todos os clientes do tenant, lida **dentro da própria transação** de
débito; rejeita se `exposição atual + valor da operação > teto`.
Simplificação deliberada e avisada ao usuário: não é um contador atômico
entre clientes DIFERENTES (o débito de um mesmo cliente continua 100%
atômico, testado); numa disputa exata entre dois clientes diferentes no
mesmo instante o teto pode ser cruzado por um valor pequeno. Aceitável no
volume do piloto (aprovação manual, poucos clientes); evolutivamente dá
pra trocar por um contador dedicado se o volume crescer.

**Pausa de emergência** — `Tenant.creditoEficazPaused`, checada no motor
único de débito (`debitCreditoEficazInTx`) antes de qualquer outra coisa:
bloqueia todo uso NOVO (PDV e Assistência Técnica) sem apagar nada do que
já existe (limites, obrigações em aberto continuam cobráveis).

**Assistência Técnica — entrada + parcelamento**: reativado exatamente
onde estava bloqueado de propósito (enum Zod, filtro no formulário,
elegibilidade do slot) — reaproveitando o mesmo molde do Fiado, já
testado em produção. Entrada = `total da OS − valor pago em Crédito
Eficaz`; o valor financiado é dividido em N parcelas iguais (a última
absorve o resto do arredondamento), vencimentos em incrementos de 30 dias
a partir do "melhor dia" do cliente (mesma função já usada no PDV). A
parcela financiada vira um `RepairOrderPayment` de verdade na hora —
fecha o saldo da OS imediatamente (permite entregar), igual ao Fiado já
fazia; a obrigação real (com vencimento) fica só no ledger do Crédito
Eficaz. Consequência de reusar esse molde: `cancelRepairOrderWithoutBilling`
já barra sozinho (trava `alreadyPaid > CENT` preexistente) — nenhum código
novo precisou lá. Cortesia numa OS já financiada não mexe no desconto (o
faturamento já fechou) — perdoa as parcelas ainda em aberto. Editar
itens/desconto de uma OS com financiamento ativo passou a ser bloqueado
(o valor já está congelado nas parcelas).

**Painel Admin** (`/credito-eficaz`): toggle de pausa, campo de teto
global, seção "Saúde do Crédito Eficaz" (indicadores agregados —
utilizado, recebido, ticket médio, entrada média, prazo médio, %
vencido, pontualidade), "Decisão do Piloto" (só leitura, nenhum botão de
aumentar limite) e "Safra" (agrupada por mês de aprovação). Onda/lote
como campo opcional na aprovação. Histórico do cliente ganhou mais
indicadores e a origem de cada parcela (venda PDV vs. OS + número da
parcela).

**Deixado de fora de propósito** (por design do adendo, nada disso
existe): score automático, biometria, IA, juros automáticos,
negativação — a decisão continua 100% humana em todas as pontas.
Margem bruta só é mostrada quando há custo confiável (Assistência
Técnica não guarda custo por item — nunca inventada).

**Testes:** 27 cenários de integração no arquivo de Crédito Eficaz agora
(11 novos desta fase: financiamento via `receiveRepairOrderPayment`/
`deliverRepairOrder` de verdade fecha o saldo da OS na hora; PIN errado
não financia nada; cortesia com financiamento ativo devolve só a fatia
não paga sem mexer no faturamento; `updateRepairOrder` recusa editar com
financiamento ativo; `cancelRepairOrderWithoutBilling` confirma que
continua recusando (regressão); safra agrupa por mês de aprovação), mais
os 11 de `commission-ranking.integration.test.ts` (confirma que a
exclusão de comissão do Crédito Eficaz continua valendo com parcelas de
OS). 57 testes de integração e 139 unitários passando, `lint`/
`typecheck`/`build` completo limpos. Teste manual no navegador (financiar
uma OS de verdade em dev) não foi feito nesta sessão — usuário optou por
considerar validado pelos testes automatizados, que já exercitam o fluxo
real ponta a ponta.

Nada commitado ainda — junto com os arquivos desta feature, o working
tree também tem mudanças não relacionadas de outra tarefa em andamento
(sangria/suprimento no caixa); vou confirmar com o usuário como separar
os commits antes de enviar qualquer coisa.

## 2026-09-01 — Colaboradores: desconto de adiantamento/mercadoria e correção de dívida fechada por engano

A partir de fotos do painel de Colaboradores (foco na Maiza PDV), o
usuário pediu três coisas em sequência na mesma sessão.

**(1) Total pendente do card por colaborador.** Hoje somava Adiantamento
+ Mercadoria + Pagamento por hora + Outro como se a loja devesse tudo
isso ao colaborador. Perguntei e confirmei o sinal certo: Adiantamento e
Mercadoria são dívida do colaborador com a loja, então devem descontar,
não somar. `Total pendente = Pagamento por hora + Outro − Adiantamento −
Mercadoria` (fica vermelho quando negativo). Adicionei também um link
"Histórico (adiantamento e mercadoria)" no card que filtra a tabela de
Lançamentos por aquele colaborador.

**(2) Líquido a receber na tela de Pagamento por horas.** Mesma lógica,
mas nunca proposta anteriormente: pedido do usuário pra que o valor a
pagar nas horas leve em conta o que a Maiza deve à loja. Confirmei duas
decisões antes de mexer em fluxo de pagamento: (a) o desconto é só
informativo — não quita os lançamentos de Adiantamento/Mercadoria nem
muda o valor que o botão "Registrar pagamento" efetivamente grava,
quitação continua manual pelo Admin na tabela de Lançamentos; (b) se o
desconto for maior que as horas, o líquido mostrado fica R$ 0,00 (nunca
negativo) e o restante da dívida continua pendente pra descontar depois.
Implementado em `getEmployeeDeductionsPending` (novo, só ADVANCE +
PURCHASE pendentes de um colaborador) e exibido como bloco extra na
`HorasPanel`.

**(3) Bug real reportado pelo usuário: dívida fechada por engano.** A
Maiza confirmou por selfie no Ponto (fluxo `confirmEmployeeLedgerEntryBySelfie`)
ter *recebido* um adiantamento/mercadoria — mas essa tela usava o mesmo
fluxo genérico de "confirmar recebimento" pra qualquer lançamento
pendente, então o sistema fechava o lançamento como **PAID**, como se a
dívida dela com a loja já tivesse sido quitada (nunca foi — ela só
confirmou ter levado o item). Corrigido:
`listPendingLedgerEntriesForEmployee` (usada só pela tela de Ponto) agora
só retorna HOURLY_PAYMENT/OTHER — nunca ADVANCE/PURCHASE — e
`confirmEmployeeLedgerEntryBySelfie` rejeita esses dois tipos no servidor
também (trava dupla, não só na tela). Como já existiam lançamentos reais
fechados por engano (pelo menos os da Maiza PDV) e não havia jeito de
desfazer um "Marcar como pago", adicionei
`revertEmployeeLedgerEntryToPending` + botão "Reverter p/ pendente" na
tabela de Lançamentos (mantém a selfie como prova, só limpa
`status`/`settledAt`).

**Confirmado com o usuário, por escrito, antes de commitar:** o
`DATABASE_URL` local aponta pro branch de dev do Neon, nunca produção —
então os lançamentos da Maiza PDV que já foram fechados por engano em
produção **continuam lá, ainda não corrigidos**; expliquei que isso
precisa ser corrigido manualmente depois do deploy, usando o novo botão
"Reverter p/ pendente" em cada lançamento de Adiantamento/Mercadoria da
Maiza (e de qualquer outro colaborador no mesmo caso) que estiver com
status "Pago" e link "ver selfie".

**Testado ao vivo** (dev local, depois removido): registrei um
adiantamento de R$ 50 pra um colaborador de teste, confirmei que ele
sumiu da tela de Ponto (não aparece mais pra confirmar recebimento),
marquei manualmente como pago pra simular o bug, e confirmei que
"Reverter p/ pendente" devolve o valor certo pro card. Testei também o
líquido a receber na tela de horas com transporte/desconto parcial e
total. `lint`, `typecheck` e `build:app` limpos, sem warning novo.

Commitado (`2e28af3`, 7 arquivos — só o código desta correção) e enviado
a pedido do usuário; `check:deploy` conferido em produção logo depois
(painel, loja, produto, categoria, comprar-whatsapp e logs — tudo OK).
Pendência real que segue em aberto: os lançamentos da Maiza PDV
(adiantamento/mercadoria) em produção continuam pendentes de correção
manual — ela não pagou esses valores, o sistema só marcou errado.
