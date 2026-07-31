# Eficaz Gestão

Sistema de gestão comercial e PDV da EficazBr: ponto de venda, controle de estoque,
catálogo online e relatórios.

O planejamento completo, com as decisões técnicas e o que ficou pendente em cada etapa,
está em [`docs/PLANO_DO_PROJETO.md`](docs/PLANO_DO_PROJETO.md).

## O que o sistema faz

- **PDV** — venda com leitor de código de barras, pagamento combinado, troco, comprovante
- **Caixa** — abertura, sangria, suprimento e fechamento com conferência
- **Produtos e estoque** — variações, importação/exportação CSV, inventário, alertas
- **Clientes e fornecedores** — cadastro e histórico
- **Catálogo online** — vitrine pública ligada ao mesmo estoque, com carrinho
- **Pedidos online** — checkout com entrega ou retirada e envio pelo WhatsApp
- **Relatórios** — faturamento, lucro, margem por produto, caixa; exportação CSV
- **Usuários** — quatro papéis com permissões e registro de atividades

## Tecnologias

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Prisma 7 · PostgreSQL (Neon) · Auth.js

## Rodando na sua máquina

Requisitos: Node.js 20.9+ e um banco PostgreSQL.

```bash
npm install
cp .env.example .env    # preencha DATABASE_URL e AUTH_SECRET
npx prisma migrate deploy
npm run dev
```

Abra `http://localhost:3000`.

Para começar com dados de exemplo (empresa, produtos, vendas e pedidos):

```bash
npm run seed:demo
```

Isso cria os acessos `admin@eficazbr.test` e `ana@eficazbr.test`, ambos com a senha
`NovaSenha@2026`. **Use apenas em desenvolvimento.**

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Aplica migrações e compila para produção |
| `npm run build:app` | Compila sem tocar no banco |
| `npm run typecheck` | Verifica os tipos |
| `npm run lint` | Analisa o código |
| `npm run seed:demo` | Popula dados de demonstração |

## Publicando na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Na Vercel, importe o repositório.
3. Configure as variáveis de ambiente (*Settings → Environment Variables*):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | Connection string do Neon **com** `-pooler` no host |
   | `DIRECT_DATABASE_URL` | Connection string **sem** `-pooler` (para as migrações) |
   | `AUTH_SECRET` | Um valor novo, gerado com `npx auth secret` |
   | `NEXTAUTH_URL` | `https://seu-projeto.vercel.app` |
   | `NEXT_PUBLIC_ROOT_DOMAIN` | O domínio onde o sistema roda |
   | `NEXT_PUBLIC_APP_HOST` | O host para onde os domínios das lojas apontam |

4. Faça o deploy. O build aplica as migrações automaticamente.

**Por que duas connection strings:** o ambiente serverless abre muitas conexões curtas e
precisa do pooler; já as migrações do Prisma exigem uma sessão dedicada e falham através
dele. Cada uma usa a sua.

**Domínio próprio das lojas:** além dos registros de DNS que o sistema mostra em
*Configurações → Domínio próprio*, o domínio precisa ser adicionado ao projeto na Vercel.
Sem isso o servidor recebe a requisição e não reconhece o host. O certificado HTTPS é
emitido automaticamente.

## Estrutura

```
src/
├── app/
│   ├── (auth)/            Login, cadastro, recuperação de senha
│   ├── (admin)/           Painel: PDV, caixa, produtos, relatórios...
│   └── loja/[subdomain]/  Catálogo público
├── modules/               Regras de negócio, sem depender de requisição
│   ├── sales/             Venda, cancelamento, baixa de estoque
│   ├── orders/            Pedidos online e mensagem do WhatsApp
│   ├── catalog/           Consultas da vitrine
│   ├── reports/           Apuração dos relatórios
│   └── domain/            Verificação de domínio próprio
├── components/ui/         Componentes reutilizáveis
└── lib/                   Prisma, sessão, permissões, formatação
```

As regras de negócio ficam em `src/modules/`; as Server Actions são invólucros finos que
resolvem sessão e empresa, e delegam. Isso permite testar as regras sem subir o servidor.

## Multiempresa

Todo dado de negócio carrega `tenantId`, e as consultas sempre filtram por ele. Cada
empresa tem um subdomínio próprio e pode conectar um domínio customizado.
