# Design System Eficaz — Painel Administrativo

> Escopo: **só o painel admin** (`src/app/(admin)/**` e os componentes que ele usa). A loja
> pública (`src/app/loja/**`) mantém o tema claro original e não é afetada por nada aqui.

Este documento é a referência oficial da identidade visual do painel. Qualquer tela nova, ou
tela existente sendo retrabalhada, deve seguir o que está descrito aqui em vez de reinventar
cor/espaçamento/componente à mão.

## Status do rollout

O design system está sendo adotado **gradualmente, fase por fase** (não é um "big bang").
Nesta fase (Fase 1) os tokens e os componentes fundamentais (`src/components/ui/*`) já usam a
paleta nova, assim como a casca do app (`(admin)/layout.tsx`, `Sidebar`, `Topbar`). Páginas
específicas (Dashboard, PDV, Produtos, Vendas, Caixa, Colaboradores, Ranking, Assistência
Técnica, Pedidos, Analytics, Configurações) ainda têm blocos com cor cravada à mão
(`bg-white`, `slate-*` etc.) até passarem pela sua fase — ver o plano de fases abaixo. Encontrar
uma tela "clara" misturada com a casca escura é esperado nesse meio-tempo, não é bug.

Fases: 1 (tokens + componentes base — concluída) → 2 (Sidebar: ícones/agrupamento/recolher) →
3 (Dashboard) → 4 (PDV) → 5 (Produtos + Estoque) → 6 (Vendas + Caixa) → 7 (Clientes +
Fornecedores) → 8 (Colaboradores + Ponto + Ranking) → 9 (Assistência Técnica + Pedidos) →
10 (Analytics + Relatórios) → 11 (Configurações) → 12 (revisão geral).

## Filosofia

- **Um tema só, escuro.** Não é "dark mode opcional" — é a identidade oficial do painel. Sem
  alternador claro/escuro.
- **Legibilidade acima de estética.** Nunca sacrificar contraste ou clareza por um efeito
  visual. Sem neon exagerado, sem glow/blur pesado, sem preto absoluto (fadiga visual em uso
  prolongado — as superfícies mais escuras usam `#0a0f0d`/`#090d0c`, nunca `#000`).
  Texto principal nunca é branco puro (`#e7ede9`, não `#ffffff`).
- **Verde é a assinatura, não o papel de parede.** Reservado para ação principal, item ativo
  de navegação e estado de sucesso. Telas continuam distinguindo status por matiz (âmbar,
  vermelho, azul), nunca só por tom de verde.
- **Performance em primeiro lugar.** Só CSS/Tailwind — sem WebGL, canvas ou bibliotecas
  pesadas de animação. Transições em `transform`/`opacity`, curtas (150–200ms), nunca em
  propriedades que causam repaint pesado.
- **Sem reinventar componente por tela.** Se um padrão se repete (card, cabeçalho de página,
  badge de status), ele vira um componente em `src/components/ui/*` — não uma nova classe
  crua reescrita em cada arquivo.

## Tokens

Fonte única da verdade: `src/app/globals.css`. Nunca usar um hex novo direto numa tela — sempre
um token existente, ou propor um token novo aqui antes de usar.

Os tokens têm valor claro em `:root` (usado pela loja pública e pelos componentes
compartilhados com ela — `Input`, `Select`, `Textarea`, `Label`, `FieldError`, `FormBanner`) e
são **sobrescritos** dentro de `.eficaz-admin` (aplicado no wrapper raiz de
`(admin)/layout.tsx`) com os valores escuros. Qualquer nó dentro dessa classe herda o tema
escuro automaticamente — não precisa de `dark:` do Tailwind.

| Token | Uso | Claro (`:root`) | Escuro (`.eficaz-admin`) |
|---|---|---|---|
| `--background` | Fundo geral da página | `#ffffff` | `#0a0f0d` |
| `--sidebar` | Fundo da sidebar/topbar | `#ffffff` | `#090d0c` |
| `--surface` | Cards, tabelas | `#ffffff` | `#131a17` |
| `--surface-hover` | Hover de linha/botão secundário | `#f8fafc` | `#19211d` |
| `--surface-elevated` | Modais, dropdowns (um degrau acima de `surface`) | `#ffffff` | `#1e2723` |
| `--border` | Borda padrão, baixo contraste | `#cbd5e1` | `#232d27` |
| `--border-active` | Borda de foco/seleção | `#64748b` | `#3d6b4a` |
| `--foreground` | Texto principal | `#171717` | `#e7ede9` |
| `--text-secondary` | Texto secundário (labels, valores de apoio) | `#334155` | `#a3b0a8` |
| `--text-muted` | Texto terciário (hints, placeholders) | `#64748b` | `#6c7972` |
| `--brand` | Cor da marca / ação principal | `#2e7d32` | `#22c55e` |
| `--brand-hover` | Hover da marca | `#256b2a` | `#3ddc84` |
| `--brand-contrast` | Texto sobre `--brand` sólido | `#ffffff` | `#04170c` |
| `--success` | Sucesso | `#059669` | `#22c55e` |
| `--warning` | Aviso | `#d97706` | `#f59e0b` |
| `--danger` | Erro/perigo | `#dc2626` | `#ef4444` |
| `--info` | Informativo | `#0284c7` | `#38bdf8` |
| `--page` | Fundo de página com leve elevação (uso pontual) | `#f4f6f8` | `= --surface` |

Raio e espaçamento usam a escala padrão do Tailwind (`rounded-md`/`rounded-lg`/`rounded-xl`,
`p-4`/`p-5`/`gap-2` etc.) — não têm token próprio, só convenção de uso (ver "Componentes"
abaixo para o padrão de cada um).

Elevação em tema escuro não usa `box-shadow` escuro (invisível sobre fundo escuro) — usa
degrau de luminosidade (`surface` → `surface-elevated`) mais uma borda fina (`border`).
`shadow-sm`/`shadow-lg` do Tailwind continuam aplicadas por sutileza, mas quem comunica
"elevado" é a superfície mais clara.

### Por que `--brand-contrast` existe

O verde da marca precisa de texto de cores diferentes em cada tema: no claro (`#2e7d32`, mais
escuro) o texto em cima é branco; no escuro (`#22c55e`, mais vívido) branco não passa em
contraste — o texto precisa ser um verde bem escuro (`#04170c`). Por isso é um token à parte,
não reaproveita `--foreground`/`--background`.

## Tipografia

Fonte: Geist Sans (`--font-sans`) para texto, Geist Mono (`--font-mono`) para dados
tabulares/monoespaçados (ex.: Ranking de Comissão). Escala de tamanho é a padrão do Tailwind
(`text-xs` a `text-2xl`) — títulos de página em `text-xl font-semibold`, título de card em
`text-sm font-semibold`, corpo em `text-sm`/`text-base`.

## Componentes (`src/components/ui/*`)

Todos já retematizados na Fase 1. Usar sempre estes em vez de recriar o padrão:

- **`Button`** (`button.tsx`) — variantes `primary` (inverte fundo/texto, ação neutra de
  destaque), `secondary` (contorno), `ghost` (sem fundo), `brand` (CTA principal, verde —
  único uso de verde de destaque em botão), `danger`.
- **`Input` / `Select` / `Textarea`** — compartilhados com a loja pública; qualquer mudança
  aqui precisa preservar o visual do lado claro.
- **`Checkbox`, `Label`, `FieldError`, `FormBanner`** — idem, compartilhados com a loja.
- **`Badge`** (`badge.tsx`) — único sistema de cor de status do painel. Variantes: `success`,
  `warning`, `danger`, `info`, `neutral`, `brand`. Fundo sempre "tingido" (`bg-<cor>/10`), nunca
  cor sólida — mantém legibilidade em tema escuro. Toda tela com status (OS, Pedido, venda,
  fiado, lançamento de colaborador) deve migrar pra este componente na sua fase (5, 6, 8, 9) em
  vez de reimplementar a paleta à mão.
- **`Pagination`, `Skeleton`, `Tooltip`** — idem, retematizados.
- **`Toast`** (`toast.tsx`) — notificação inline (não-portal); depende do `.eficaz-admin`
  envolver o `ToastProvider`, não só a div visual (ver "Armadilhas" abaixo).
- **`DropdownMenu`** (`dropdown-menu.tsx`) — usa `createPortal` num alvo próprio dentro do
  escopo escuro (`#eficaz-admin-portal-root`, declarado em `(admin)/layout.tsx`), nunca
  `document.body` direto (ver "Armadilhas").
- **`Dialog`** (`dialog.tsx`) — modal padrão, superfície `surface-elevated`.
- **`Card` / `CardTitle`** (`card.tsx`, novo) — substitui o padrão manual
  `rounded-xl border bg-white p-5 shadow-sm` repetido em dezenas de arquivos. Adoção é gradual,
  tela por tela, conforme cada uma passa pela sua fase.
- **`PageHeader`** (`page-header.tsx`, novo) — título + subtítulo + slot de ações, substitui o
  padrão manual de `<h1>` + botões repetido em 76+ arquivos. Mesma adoção gradual.
- **`StatCard` / `ShareBar` / `EmptyState`** (`src/components/admin/stat-card.tsx`) — card de
  métrica padrão (Analytics/Relatórios hoje, outras telas nas próximas fases). `ShareBar`
  continua barra proporcional em CSS puro (sem lib de gráfico); preenchimento usa `bg-brand`.

## Armadilhas de escopo (já resolvidas, documentar para não repetir)

1. **Provider como pai da div `.eficaz-admin`, não filho.** Um Context Provider não cria nó de
   DOM — se `.eficaz-admin` estiver só na div visual e o `ToastProvider` for pai dela, o toast
   (renderizado inline, sem portal) fica fora do escopo escuro. Correção aplicada em
   `(admin)/layout.tsx`: `.eficaz-admin` envolve os providers inteiros.
2. **`createPortal(..., document.body)` escapa qualquer escopo de classe.** `document.body` é
   compartilhado com a loja pública. Correção: portal do `DropdownMenu` aponta para
   `#eficaz-admin-portal-root`, uma div dentro de `.eficaz-admin` criada especificamente pra
   isso em `(admin)/layout.tsx`.

## O que NÃO alterar

Regra permanente, não só da Fase 1: nenhuma mudança de design mexe em regra de negócio,
cálculo, permissão, schema, migration ou Server Action. Mudança é sempre classe/JSX/componente
visual. Bloco de impressão térmica (`@media print` em `globals.css`, incluindo `color: #000`
cru) é intencionalmente independente de tema e não deve ser tokenizado.
