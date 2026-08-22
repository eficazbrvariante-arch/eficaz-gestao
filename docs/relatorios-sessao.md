# Relatórios de sessão

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
