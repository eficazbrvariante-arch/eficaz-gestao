# PWA da loja pública

> Escopo: **só o site público** (`src/app/loja/[subdomain]/**`). Painel administrativo, PDV,
> caixa e colaboradores não têm PWA e não são alcançados pelo Service Worker — ver
> [Segurança](#segurança).

A loja pública é instalável: o cliente abre pelo navegador, recebe um convite discreto e passa a
ter um ícone na tela inicial que abre a mesma loja em janela própria, sem barra de endereço.

Não existe segundo sistema. Mesma base de código, mesmo banco, mesmo catálogo, mesma
autenticação. A PWA é uma camada de experiência sobre o que já existia.

## Arquitetura

Cada loja (tenant) tem a própria PWA, montada a partir do que a empresa já cadastrou no painel —
nome, logo e cor. Nada é fixo no código, nenhum asset novo foi adicionado ao repositório.

| Arquivo | Papel |
|---|---|
| `src/modules/pwa/store-scope.ts` | Decide o caminho base da loja no host da requisição — de onde sai todo o resto |
| `src/modules/pwa/store-icon.ts` | Busca o logo, valida, e calcula contraste/iniciais do ícone de fallback |
| `src/app/loja/[subdomain]/manifest.webmanifest/route.ts` | Web App Manifest por tenant |
| `src/app/loja/[subdomain]/icones/[icone]/route.tsx` | Ícones gerados sob demanda |
| `src/app/loja/[subdomain]/sw.js/route.ts` | Service Worker gerado por tenant |
| `src/app/loja/[subdomain]/offline/route.ts` | Tela de "sem conexão" |
| `src/app/loja/[subdomain]/pwa-register.tsx` | Registra o SW e avisa quando há versão nova |
| `src/app/loja/[subdomain]/install-invite.tsx` | Convite de instalação (Android/desktop e iOS) |
| `src/app/loja/[subdomain]/layout.tsx` | Amarra tudo: `<link rel=manifest>`, `theme-color`, metadata Apple |

### Escopo por host — a decisão que sustenta o resto

A mesma loja é alcançável por três caminhos diferentes (ver `src/proxy.ts`):

| Como o cliente chega | Caminho base | `scope` da PWA |
|---|---|---|
| Host público compartilhado (`www.eficazbr.com.br/loja/eficazbr`) | `/loja/eficazbr/` | `/loja/eficazbr/` |
| Domínio próprio da loja (`minhaloja.com.br`) | `/` | `/` |
| Subdomínio (`eficazbr.<ROOT_DOMAIN>`) | `/` | `/` |

`resolveStoreBasePath()` resolve isso a cada requisição, e daí saem `scope`, `start_url` e o
lugar onde o Service Worker é registrado.

**Isso é uma decisão de segurança, não de estética.** No host compartilhado,
`www.eficazbr.com.br` também serve o painel administrativo em `/`. Um Service Worker com
`scope: "/"` ali passaria a controlar rotas do painel e do PDV. Prendendo o escopo em
`/loja/<subdominio>/`, é o próprio navegador que impede isso — não uma regra nossa que alguém
pode esquecer de manter.

Pelo mesmo motivo, "é domínio próprio?" é confirmado resolvendo o host de volta para *aquela*
loja (`resolveCustomDomain`), e não com um `!isAppHost()` solto: em produção `ROOT_DOMAIN` é
`app.eficazbr.com.br`, então `www.eficazbr.com.br` **não** é `isAppHost` — um teste negativo
daria `scope: "/"` justamente no host onde isso seria perigoso.

## Manifest

Servido em `/loja/<subdominio>/manifest.webmanifest`, montado por tenant:

- `name` / `short_name` — nome fantasia da loja (`short_name` cortado na palavra em ~12 caracteres)
- `id` — igual ao caminho base; fixa a identidade do app instalado mesmo se `start_url` mudar depois
- `start_url` / `scope` — o caminho base do host (tabela acima)
- `display: standalone` — abre sem barra de endereço, com cara de aplicativo
- `theme_color` — `Tenant.primaryColor`; `background_color` — branco, o tema da loja
- `lang: pt-BR`, `categories: ["shopping"]`

**Sem `orientation` de propósito.** A mesma loja é usada em celular, tablet e desktop; travar em
retrato prejudicaria os dois últimos. Em desktop a PWA instalada abre em janela própria
redimensionável, e nada da navegação normal muda para quem continuar no navegador.

Cache de 5 minutos: trocar nome, cor ou logo no painel reflete rápido no app instalado.

## Ícones

Gerados sob demanda em `/loja/<subdominio>/icones/<variante>` com `ImageResponse` (`next/og`,
já parte do Next — nenhuma dependência nova).

| Variante | Tamanho | Uso |
|---|---|---|
| `192.png`, `512.png` | 192, 512 | `purpose: any` |
| `maskable-192.png`, `maskable-512.png` | 192, 512 | `purpose: maskable` (Android) |
| `apple-touch-180.png` | 180 | `apple-touch-icon` do iOS |

- **Com logo cadastrado**: logo centralizado sobre fundo branco. Branco porque é o que a maioria
  das marcas espera e porque o iOS compõe ícone transparente sobre preto — um logo escuro sumiria.
- **Sem logo**: iniciais do nome sobre `primaryColor`, com o texto em preto ou branco escolhido
  por luminância relativa (WCAG), então o contraste funciona com qualquer cor cadastrada.
- **Maskable** reserva a zona de segurança: o conteúdo ocupa 60% do lado, contra 78% das demais,
  porque o Android pode recortar até o círculo inscrito.

O logo só é aceito de `*.public.blob.vercel-storage.com`, em PNG/JPEG/WebP e até 400 KB. É o
storage da própria plataforma; `logoUrl` vem do banco, e uma URL arbitrária ali seria uma
requisição de saída controlada por quem edita o cadastro. SVG fica de fora porque o suporte do
Satori é parcial e um SVG quebrado renderizaria um ícone vazio — pior que as iniciais. Qualquer
falha (blob removido, tipo inesperado, timeout) cai silenciosamente nas iniciais.

O caminho termina em `.png` de propósito: o `matcher` do `proxy.ts` ignora extensões de imagem,
então carregar ícone não passa por resolução de domínio nem de sessão.

## Service Worker e estratégia de cache

Este é o ponto mais delicado da PWA, e a estratégia é deliberadamente conservadora.

| Tipo de conteúdo | Estratégia |
|---|---|
| Página offline, ícones da PWA | Pré-carregados no `install`, servidos do cache |
| `/_next/static/**` (JS/CSS versionado) | Cache-first — o nome já contém hash, não muda de conteúdo |
| Navegação (qualquer página da loja) | **Sempre rede.** Cache só se a rede falhar, e só para mostrar a tela offline |
| Payload RSC, dados, `/api/**` | **Nunca cacheado**, nunca interceptado |
| `POST`/`PUT`/`DELETE` (Server Actions, checkout, login, rastreio) | **Nunca interceptado** — passa direto |
| Outro domínio (imagens do Blob, fontes) | Fora do escopo, ignorado |

Consequência prática: **produto, preço, promoção, estoque, carrinho, conta, pedidos, Crédito
Eficaz e Proteção Eficaz continuam vindo do servidor a cada carregamento**, exatamente como
antes da PWA. Nenhuma dessas informações fica guardada no dispositivo.

### Preço e estoque

O servidor continua sendo a única fonte de verdade. Nada do que o Service Worker guarda entra em
decisão comercial: preço e disponibilidade nunca são lidos do cache, e as validações do backend
(`resolveEffectiveUnitPrice` e o restante do fluxo de venda) seguem soberanas. Não existe
caminho em que uma compra se conclua com valor guardado no dispositivo — porque valor nenhum é
guardado.

### Offline — o que a PWA faz e o que não faz

Nesta fase **não existe operação offline**. Sem conexão não há venda, pedido, uso de crédito,
alteração de cadastro nem pagamento. Nada é enfileirado para enviar depois, e nada de financeiro
é simulado sem servidor.

O que existe é a tela de `/loja/<subdominio>/offline`: um documento HTML completo, com estilo
embutido e zero dependência externa. Não é uma página do Next de propósito — offline não há
garantia de que o CSS e os chunks de JS do Next estejam em cache, e essa é justamente a hora em
que a tela precisa aparecer inteira. Traz o ícone da loja (pré-carregado junto), "Sem conexão no
momento", "Verifique sua internet e tente novamente" e o botão **TENTAR NOVAMENTE**.

### Atualização

O Service Worker é gerado com uma versão vinda de `VERCEL_GIT_COMMIT_SHA`, então **cada deploy
produz um script diferente** e o navegador detecta a mudança. Em `activate`, todo cache de
versão anterior é apagado.

A troca nunca acontece sozinha. O worker novo fica em `waiting` e o cliente vê uma faixa discreta
— "Uma nova versão está disponível." + **Atualizar** — que só então dispara `SKIP_WAITING` e
recarrega. O aviso **não aparece durante o checkout**: ali a atualização espera.

Como navegação nunca é servida do cache, o cliente nunca fica preso numa versão antiga da loja
mesmo que ignore o aviso — o que ele veria desatualizado seriam apenas as regras de cache do
próprio worker.

> Em desenvolvimento a versão é fixa (`dev`) e o corpo do script não muda, então o ciclo de
> atualização não é testável localmente. Precisa de dois deploys de preview na Vercel.

## Instalação

O convite é uma faixa no rodapé, **nunca um modal**. Regras de convivência, nesta ordem — não
aparece:

1. para quem já está com a loja instalada (`display-mode: standalone`);
2. para quem já dispensou uma vez — a dispensa fica no `localStorage` e é **definitiva**;
3. para quem acabou de chegar — espera a segunda página da sessão e mais 1,5s;
4. em carrinho, checkout ou conta — nenhuma compra é interrompida;
5. em navegador embutido de aplicativo (Instagram, Facebook, WeChat), onde não há como instalar.

Recusar o diálogo do sistema também conta como dispensa.

- **Android / Chrome / desktop**: usa `beforeinstallprompt`. O evento é sempre impedido, mesmo
  quando a faixa não vai aparecer — sem isso o Chrome mostra a própria barra de instalação, no
  tempo dele e com o texto dele.
- **iOS / Safari**: o evento não existe. A faixa mostra a instrução manual — *toque em
  Compartilhar → Adicionar à Tela de Início*. A detecção cobre o iPadOS 13+, que manda
  User-Agent de macOS, cruzando com `maxTouchPoints` (mesma limitação já documentada em
  `analytics/device-classifier.ts`).
- **Desktop**: instalável onde navegador e sistema suportarem; abre em janela própria.

No iOS o layout usa `apple-mobile-web-app-status-bar-style: default`, mantendo a barra de status
opaca e o conteúdo abaixo dela. `black-translucent` empurraria o cabeçalho da loja para debaixo
do relógio do iPhone e exigiria tratar `safe-area-inset` em todas as telas para não cortar nada.

## Navegação e deep links

Nada mudou: mesmas URLs, mesmo login, mesmo carrinho, mesmos links compartilháveis. Quem receber
o link de um produto continua abrindo aquele produto, dentro ou fora do app instalado. A PWA não
introduziu roteamento próprio nem tela diferente — instalada, é a mesma loja.

## Segurança

- **O Service Worker não alcança painel, PDV, caixa nem colaboradores.** No host compartilhado
  isso é garantido pelo escopo `/loja/<subdominio>/`, que o navegador impõe. No domínio próprio,
  aquele host só serve aquela loja.
- **Nada sensível é cacheado.** `/conta`, `/checkout`, `/carrinho`, Crédito Eficaz, Proteção
  Eficaz, pedidos e dados pessoais são navegação ou `/api` — as duas categorias que nunca ficam
  no cache. O único conteúdo persistido no dispositivo é a tela offline e os ícones.
- **Nada que grava passa pelo Service Worker.** Só `GET` é interceptado; Server Actions, login e
  checkout vão direto para a rede.
- **Autenticação, cookies e sessões não foram tocados.** A PWA não muda nada de `auth`,
  `customer-session` ou do `proxy.ts`.
- A tela offline usa um `<script>` inline. Hoje o projeto não define CSP; se um dia definir,
  esse ponto precisa de um hash ou nonce.

## Analytics

`VisitorSession.displayMode` (`BROWSER` / `STANDALONE`) registra se a visita veio da PWA
instalada ou de uma aba comum, permitindo medir a adoção.

- Vai junto no payload que o rastreio já enviava — **nenhum evento novo, nenhum pageview
  duplicado**.
- Gravado só na criação da sessão: o modo é característica dela. Instalar a PWA no meio da visita
  não reescreve a sessão em curso; a próxima é que nasce `STANDALONE`.
- Vem do cliente, então é indicador de produto — não dado confiável para decisão de negócio.

Ainda não há tela no painel mostrando esse recorte; o dado está sendo acumulado para quando
houver.

## Performance

Nenhuma dependência nova foi instalada. O Service Worker é um arquivo pequeno escrito à mão, sem
Workbox nem Serwist — as regras de cache aqui são finas demais (nunca cachear preço, estoque,
conta) para uma configuração genérica, e uma biblioteca só acrescentaria peso e superfície.

Os componentes de convite e de atualização são duas faixas de rodapé sem animação, montadas
apenas quando têm o que mostrar. Os ícones são gerados no servidor e cacheados por 1h.

## Limitações conhecidas

- **No host compartilhado o Service Worker não alcança `/_next/static/`** (está fora do escopo
  `/loja/<subdominio>/`). Esses arquivos continuam servidos pelo cache HTTP da CDN, que já é
  eficiente para conteúdo versionado. A regra de cache-first existe e funciona no domínio
  próprio, onde o escopo é `/`.
- **A tela offline é pré-carregada uma vez por versão do worker.** Se a loja mudar de nome ou cor,
  a tela offline guardada só reflete isso no próximo deploy.
- **Subdomínio `<loja>.<ROOT_DOMAIN>` não funciona em produção** — não há DNS coringa, limitação
  que já existia antes da PWA (ver comentário em `tenant-resolver.ts`). O código trata esse caso
  porque ele funciona em desenvolvimento e pode voltar a existir.
- **O ciclo de atualização não é testável em desenvolvimento** (versão fixa `dev`).

## Como testar

Testado até aqui: lint, TypeScript, build completo, os 139 testes existentes, e as rotas de
manifest, ícones, Service Worker e offline respondendo corretamente nos dois modos de host.

Falta a verificação em aparelho real, que precisa de HTTPS — ou seja, um deploy de preview:

- [ ] **Android/Chrome**: instalar pelo convite, abrir standalone, conferir ícone e splash
- [ ] **iOS/Safari**: Compartilhar → Adicionar à Tela de Início, conferir ícone e título
- [ ] **Desktop**: instalar e abrir em janela própria
- [ ] **Manifest**: Lighthouse / DevTools → Application → Manifest sem erros
- [ ] **Offline**: DevTools → Network → Offline, navegar e ver a tela offline; botão TENTAR NOVAMENTE
- [ ] **Atualização**: dois deploys seguidos, conferir a faixa "Nova versão" e o recarregamento
- [ ] **Escopo**: DevTools → Application → Service Workers, confirmar que o escopo é o da loja e
      que `/dashboard` e `/pdv` **não** são controlados
- [ ] **Fluxo completo instalado**: login, logout, carrinho, produto, checkout, conta
- [ ] **Deep link**: abrir link de produto direto, dentro e fora do app
- [ ] **Responsivo**: iPhone pequeno, Pro Max, Android, tablet e desktop — sem overflow horizontal,
      sem botão cortado, sem faixa sobrepondo o botão flutuante do WhatsApp
- [ ] **Analytics**: conferir sessões nascendo com `displayMode = STANDALONE` depois de instalar

## Evolução futura — PWA central do marketplace

Nada disto está implementado. O que segue é o caminho que a arquitetura atual **deixa aberto**, e
as decisões desta fase foram tomadas para não fechá-lo.

O conceito é *"200 lojas físicas, uma única vitrine digital"*:

```
VITRINE BR / FKS BR
  └─ PWA CENTRAL          (um app instalado, não 200)
       └─ GALERIA DIGITAL (busca, categorias, mapa da galeria)
            └─ LOJAS      (001, 002, 003 … 200)
                 └─ PRODUTOS, PEDIDOS
```

### Por que isso continua possível

- **A loja já é um caminho, não um domínio.** `/loja/<subdominio>/…` é a forma canônica em todo o
  sistema, inclusive nos links internos gerados quando a loja tem domínio próprio. Uma PWA
  central instalada no host raiz com `scope: "/"` teria cada loja como uma seção dentro dela,
  sem nenhuma mudança de rota.
- **O escopo é calculado, não fixo.** `resolveStoreBasePath()` é o único lugar que decide onde a
  PWA vive. Uma PWA central acrescenta um caso a essa função; não exige reescrever manifest,
  Service Worker ou registro.
- **Box não é a identidade da loja.** O identificador permanente é `Tenant.subdomain`
  (`@unique` no banco), nunca um número de box. Uma loja pode mudar do Box 037 para o 052 sem
  perder identidade, catálogo, histórico, avaliações, clientes ou URL. O número do box, quando
  existir, será um atributo de localização física — não a chave de nada.
- **Isolamento por tenant é a regra hoje**, o que significa que a busca cross-tenant do
  marketplace é trabalho novo e deliberado, não um efeito colateral. A avaliação dessa parte
  (incluindo a recomendação de uma tabela `MarketplaceListing` dedicada em vez de query
  cross-tenant direta) está em [`marketplace-readiness.md`](./marketplace-readiness.md).

### O que precisaria ser decidido quando chegar a hora

- Um manifest da PWA central no host raiz, com `scope: "/"` — e a definição de como ele convive
  com os manifests por loja (o cliente que já instalou "a EficazBr" não deve perder o app dele).
- Como o app central lembra a última loja escolhida sem quebrar deep links para outras.
- Se lojas com domínio próprio continuam tendo PWA independente (provavelmente sim: é a marca
  delas).

## Notificações push — não ativadas

Nesta fase **não** foi ativado nada de push, e o site **não pede permissão de notificação ao
abrir** — seria uma experiência ruim e derrubaria a taxa de aceitação para o dia em que houver
algo útil a notificar.

A arquitetura suporta quando for a hora: pedido pronto, atualização de pedido, promoção
autorizada, novidade da loja favorita. O caminho seria VAPID + `web-push`, com a inscrição
guardada por cliente e por tenant, e a permissão pedida **depois de uma ação que a justifique**
(ex.: ao concluir um pedido, oferecer acompanhar o status) — nunca no primeiro carregamento. O
Service Worker já existe e é onde os handlers `push`/`notificationclick` entrariam.
