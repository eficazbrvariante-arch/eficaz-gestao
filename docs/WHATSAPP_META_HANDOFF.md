# Handoff — Módulo nativo de WhatsApp/Meta do Eficaz BR

> **Antes de alterar qualquer coisa relacionada a WhatsApp/Meta, leia este arquivo inteiro, confira o
> estado atual do repositório (`git log`, `git status`, `vercel env ls`) e continue a partir do primeiro
> item pendente. Não refaça etapas já concluídas e não substitua configurações existentes sem verificar
> o que já está lá.**

## PRÓXIMO PASSO AO RETOMAR

**Retomar a criação/acesso ao App no Meta for Developers.** Depois obter `App Secret`, definir o
`Verify Token`, e obter `phoneNumberId`, `wabaId` e o access token permanente. Só então configurar as
duas variáveis pendentes no Vercel e executar a integração do tenant real (`npm run whatsapp:set-integration`).

**Não comece pela implementação do backend** — o backend (schema, provider, webhook) já está pronto e
testado. O bloqueio atual é 100% do lado do painel da Meta (ver seção 6).

---

## 1. Objetivo

Implementação do módulo nativo de WhatsApp do Eficaz BR ("Central de Atendimento"), usando
exclusivamente a integração oficial **WhatsApp Cloud API / Meta for Developers** — sem WhatsApp Web,
scraping ou bibliotecas de automação de navegador. Multi-tenant: cada loja (tenant) terá seu próprio
número/WABA conectado.

## 2. O que já está pronto no código

Verificado no repositório em 2026-08-08 (branch `main`, commit `4ad770e`):

- [x] **Schema Prisma** (`prisma/schema.prisma`, bloco "Fase 9 — Central de Atendimento WhatsApp"):
  `WhatsAppIntegration`, `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppQueue`,
  `WhatsAppTag`, `WhatsAppConversationTag`, `WhatsAppQuickReply` + enums relacionados. Migration
  `prisma/migrations/20260808025502_whatsapp_central_atendimento/` já aplicada no banco de dev.
- [x] **Abstração de provider** (`src/modules/whatsapp/`):
  - `whatsapp-provider.ts` — interface `WhatsAppProvider` (`sendTextMessage`, `sendMediaMessage`,
    `markAsRead`, `downloadMedia`).
  - `meta-cloud-api-provider.ts` — implementação concreta (`MetaCloudApiProvider`) sobre a Graph API,
    mais as funções soltas `parseMetaWebhookPayload` e `validateMetaWebhookSignature` (não são método
    de instância porque dependem só do segredo global do App, não de credencial por tenant).
  - `get-whatsapp-provider.ts` — `getWhatsAppProvider(tenantId)` e `getWhatsAppProviderByPhoneNumberId(phoneNumberId)`.
  - `token-crypto.ts` — cifra/decifra o access token (AES-256-GCM) antes de gravar no banco.
- [x] **Webhook de recebimento** — ver seção 3.
- [x] **Ingestão de mensagens** (`inbound-message-service.ts`): resolve tenant pelo `phoneNumberId`,
  cria/atualiza `WhatsAppContact` (com tentativa de vínculo automático a `Customer` por telefone —
  `customer-matcher.ts`), acha ou reabre a `WhatsAppConversation`, baixa mídia recebida e rehospeda no
  Vercel Blob, persiste a `WhatsAppMessage` com idempotência (`@@unique([tenantId, externalId])`).
- [x] **Normalização de telefone** (`phone-normalizer.ts`) — corrige a ambiguidade do nono dígito de
  celular brasileiro.
- [x] **Script de configuração manual da integração** — ver seção 8.
- [x] **Vitest configurado** (`vitest.config.mts`) — primeiro test runner do projeto. 17 testes
  passando (`phone-normalizer.test.ts`, `token-crypto.test.ts`).
- [x] **Testado localmente de ponta a ponta** contra o banco de dev, simulando payloads assinados da
  Meta via `curl`: handshake do webhook, recebimento de mensagem, idempotência em reenvio, assinatura
  inválida rejeitada, vínculo automático de contato a cliente existente. Dados de teste já removidos do
  banco depois.
- [x] Dois commits no `main`, já enviados ao GitHub (`git push origin main` já executado):
  - `fb6cb67` — redefinição de senha de cliente pelo admin (feature não relacionada a WhatsApp).
  - `4ad770e` — módulo WhatsApp (Fase 1 + Fase 2).

**Ainda não implementado** (não foi tentado, sem ambiguidade):

- [ ] UI da Central de Atendimento (lista de conversas, chat, Raio-X do cliente) — Fase 3.
- [ ] Envio de mensagem pelo atendente, filas, atribuição de responsável — Fase 4.
- [ ] Etiquetas, respostas rápidas, auditoria de ações — Fase 5.
- [ ] Tela de configurações no painel para cadastrar a integração (hoje só via script de linha de
  comando — ver seção 8).
- [ ] Nunca testado contra a Graph API real da Meta nem contra um App real — só localmente, com payload
  simulado.

## 3. Endpoint de webhook já preparado

**URL de produção:** `https://app.eficazbr.com.br/api/whatsapp/webhook`
**Implementado em:** `src/app/api/whatsapp/webhook/route.ts`

- **`GET`** — handshake de verificação exigido pela Meta ao salvar o Callback URL. Lê
  `hub.mode`/`hub.verify_token`/`hub.challenge` da query string, compara o token recebido com
  `process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN`; se bater, responde `200` com o `challenge` no corpo; caso
  contrário, `403`.
- **`POST`** — recebimento de eventos. Lê o corpo bruto, valida o header `X-Hub-Signature-256` via
  `validateMetaWebhookSignature()` (HMAC-SHA256 com `WHATSAPP_APP_SECRET`, comparação em tempo
  constante) — `401` se a assinatura não bater ou estiver ausente. Se válida, faz o parse do payload
  (`parseMetaWebhookPayload()`, defensivo — nunca lança para formato inesperado) e processa cada evento
  (`processWebhookEvent()`, em `inbound-message-service.ts`). Sempre responde `200` no processamento
  normal (mesmo se um evento individual falhar — o erro só é logado), para não fazer a Meta reenviar em
  loop ou desativar o webhook por falhas repetidas.
- Rota fora do `matcher` do `src/proxy.ts` (que exclui `/api`), então não passa pela checagem de sessão
  do painel — correto, é um endpoint público chamado pela Meta.

## 4. Dados da Meta que ainda precisamos obter

**Nenhum valor real está registrado neste arquivo — só os nomes e onde cada um deve ser configurado.**

| Dado | Onde configurar | Observação |
|---|---|---|
| `WHATSAPP_APP_SECRET` | Variável de ambiente (Vercel + `.env` local) | Vem do painel do App na Meta. Global — um único App para todos os tenants. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Variável de ambiente (Vercel + `.env` local) | **Não vem da Meta** — é uma string que nós inventamos e cadastramos nos dois lugares (Meta e aqui). |
| `phoneNumberId` | Banco de dados, por tenant (`WhatsAppIntegration.phoneNumberId`), via script da seção 8 | Não é variável de ambiente. |
| `wabaId` (WhatsApp Business Account ID) | Banco de dados, por tenant (`WhatsAppIntegration.wabaId`), via script da seção 8 | Não é variável de ambiente. |
| Token de acesso permanente | Banco de dados, por tenant (`WhatsAppIntegration.accessToken`), **cifrado** via `token-crypto.ts` antes de gravar, via script da seção 8 | Nunca em variável de ambiente, nunca em texto puro no banco. |

## 5. Configuração pendente no Meta for Developers

- [!] Concluir/acessar corretamente o painel de Apps da Meta (**bloqueado agora** — ver seção 6).
- [ ] Criar o App adequado para o WhatsApp (tipo Negócios/Business).
- [ ] Adicionar/configurar o produto WhatsApp no App.
- [ ] Obter o App Secret.
- [ ] Definir um Verify Token (string escolhida por nós).
- [ ] Configurar o callback do webhook: `https://app.eficazbr.com.br/api/whatsapp/webhook`.
- [ ] Usar o mesmo Verify Token no Meta e nas variáveis de ambiente da aplicação.
- [ ] Verificar e salvar o webhook (a Meta vai chamar o `GET` acima — já implementado e testado).
- [ ] Assinar o campo `messages` no webhook.
- [ ] Obter o `phone_number_id`.
- [ ] Obter o `WhatsApp Business Account ID` (wabaId).
- [ ] Gerar um token permanente usando um Usuário de Sistema (System User) com permissão
  `whatsapp_business_messaging` — não o token de teste de 24h.

## 6. Estado atual do processo manual na Meta

Conseguimos:

- [x] Criar/validar o acesso ao Meta for Developers.
- [x] Realizar verificações da conta.
- [x] Acessar a documentação da WhatsApp Business Platform / Cloud API.

Bloqueio atual:

- [!] **Ao tentar acessar o Painel de Apps / "Criar aplicativo", a Meta está redirecionando
  repetidamente para a página inicial/documentação de "Tecnologias Sociais"**, sem deixar chegar ao
  fluxo normal de criação do App. Ainda não resolvido nesta sessão — é o próximo ponto a investigar
  quando a sessão for retomada (ver "PRÓXIMO PASSO AO RETOMAR" no topo).

## 7. Vercel

- **Projeto:** `eficazbr-gestao/eficaz-gestao` (`.vercel/repo.json` já linka o repositório).
- **Domínio de produção:** `app.eficazbr.com.br`.
- **Estado confirmado em 2026-08-08** via `vercel env ls production` / `vercel env ls preview`:
  - [x] `WHATSAPP_TOKEN_ENCRYPTION_KEY` — já cadastrada em **Production** e **Preview** (valor gerado
    nesta sessão, não depende da Meta).
  - [ ] `WHATSAPP_APP_SECRET` — **ainda não cadastrada**.
  - [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — **ainda não cadastrada**.

**Antes de mexer em variáveis de ambiente na próxima sessão:** rodar `vercel env ls production` (e
`preview`) primeiro para conferir o estado atual — não presumir, e não sobrescrever nenhuma variável já
existente sem checar o que já está lá. As 8 variáveis pré-existentes do projeto (banco, auth, blob,
e-mail etc.) não têm nenhuma relação com WhatsApp e não devem ser tocadas.

## 8. Integração do tenant

**Script:** `scripts/whatsapp-set-integration.mts`
**Alias no `package.json`:** `npm run whatsapp:set-integration`

```
npm run whatsapp:set-integration -- \
  --subdomain=<subdominio-do-tenant> \
  --phone-number-id=<phoneNumberId> \
  --waba-id=<wabaId> \
  --access-token=<token-permanente> \
  [--display-phone="+55 11 99999-8888"]
```

Comportamento (confirmado lendo `scripts/whatsapp-set-integration.mts`):

1. Busca o `Tenant` pelo `subdomain` informado — falha com mensagem clara se não existir.
2. Cifra o `access-token` com `encryptSecret()` (`token-crypto.ts`, AES-256-GCM) antes de gravar —
   exige `WHATSAPP_TOKEN_ENCRYPTION_KEY` disponível no ambiente onde o script roda.
3. Faz `upsert` em `WhatsAppIntegration` usando `tenantId` como chave (relação 1:1 — um tenant tem no
   máximo uma integração), gravando `phoneNumberId`, `wabaId`, `displayPhoneNumber`, `accessToken`
   (cifrado), `status: "ACTIVE"` e `connectedAt: now()`.
4. O webhook resolve o tenant certo a partir do `phoneNumberId` (globalmente único na Meta) via
   `getWhatsAppProviderByPhoneNumberId()` — é essa coluna que liga a mensagem recebida ao tenant correto.

**Qual tenant configurar:** ainda não decidido/confirmado — perguntar ao usuário qual `subdomain` real
usar antes de rodar o script com valores de verdade. (Nesta sessão o script só rodou uma vez, contra o
tenant de teste `eficazbr`, com valores fictícios, para validar o webhook localmente — os dados de teste
já foram apagados do banco depois. **Não repetir esse teste com valores fictícios** — a próxima execução
deve ser com credenciais reais.)

**Atenção operacional:** o script usa `DATABASE_URL` do ambiente onde é executado (via `dotenv/config`,
que carrega `.env`, não `.env.local`). Rodar localmente grava no banco de **dev**; para configurar o
tenant em **produção**, será preciso rodar contra a `DATABASE_URL` de produção (ex.: `vercel env pull`
para um arquivo separado, ou apontar `DATABASE_URL` explicitamente) — confirmar isso deliberadamente
antes de rodar, para não gravar num banco errado.

**Como validar que a integração foi salva corretamente:**
- Consultar `WhatsAppIntegration` pelo `tenantId` (ou `phoneNumberId`) e conferir `status: "ACTIVE"` e
  `connectedAt` preenchido.
- Enviar uma mensagem de verdade pelo WhatsApp para o número configurado e verificar se surgem
  `WhatsAppContact` → `WhatsAppConversation` → `WhatsAppMessage` correspondentes (só funciona depois do
  webhook estar configurado de verdade na Meta, seção 5).

## 9. Próxima sessão

Ver "PRÓXIMO PASSO AO RETOMAR" no topo deste arquivo.

## 10. Controle de progresso

- **Última atualização:** 2026-08-08
- **Branch atual:** `main`
- **Último commit relevante:** `4ad770e` — "Inicia modulo nativo de WhatsApp: modelos de dados, provider Meta Cloud API e webhook de recebimento" (já enviado a `origin/main`)
- **Arquivos principais envolvidos:**
  - `prisma/schema.prisma` (bloco "Fase 9") + `prisma/migrations/20260808025502_whatsapp_central_atendimento/`
  - `src/modules/whatsapp/*.ts`
  - `src/app/api/whatsapp/webhook/route.ts`
  - `scripts/whatsapp-set-integration.mts`
  - `vitest.config.mts`
- **Comandos úteis para validação:**
  - `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build:app`
  - `vercel env ls production` / `vercel env ls preview` — conferir variáveis já cadastradas
  - `npm run whatsapp:set-integration -- --subdomain=... --phone-number-id=... --waba-id=... --access-token=...`
- **Problemas/bloqueios conhecidos:**
  - [!] Painel de Apps da Meta redirecionando para "Tecnologias Sociais" em vez de permitir criar o App (seção 6) — bloqueio atual.
  - Correspondência de cliente por telefone (`customer-matcher.ts`) é uma varredura completa dos
    clientes do tenant (sem coluna normalizada) — aceitável para o volume de uma loja, não escala
    indefinidamente.
  - Sem lock para "uma conversa aberta por contato" — corrida rara entre duas mensagens simultâneas do
    mesmo contato novo poderia, em teoria, criar duas conversas.
- **Decisões importantes já tomadas:**
  - Um único App da Meta compartilhado por todos os tenants (`WHATSAPP_APP_SECRET` e
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN` são globais); cada tenant só tem seu próprio
    `phoneNumberId`/`wabaId`/`accessToken`, guardados em `WhatsAppIntegration`.
  - Sem tabela separada para "atribuição de conversa" — `assignedUserId`/`queueId` ficam direto em
    `WhatsAppConversation`; histórico de mudança fica no `AuditLog` já existente (a integrar na Fase 5).
  - Vínculo automático de `WhatsAppContact` a `Customer` por telefone é intencional (a missão original
    pede isso) e foi considerado um risco diferente do "nunca vincular por telefone" já registrado em
    `order-service.ts` — lá o vínculo dava acesso de login; aqui é só um rótulo interno de exibição.
  - Mídia recebida é baixada da Meta e rehospedada no Vercel Blob de forma síncrona, dentro do próprio
    processamento do webhook (sem fila/job — o projeto não tem nenhuma).
  - Vitest foi introduzido como primeiro test runner do projeto (antes não havia nenhum).

## 11. Regra para futuras sessões

Antes de alterar qualquer coisa relacionada a WhatsApp/Meta, leia este arquivo inteiro, confira o estado
atual do repositório e continue a partir do primeiro item pendente. Não refaça trabalho concluído e não
substitua configurações existentes (no banco, no Vercel ou no Meta) sem verificar antes o que já está
lá.
