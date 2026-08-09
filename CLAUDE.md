## Idioma

Responda sempre em português do Brasil, incluindo planos, resumos e mensagens de commit. Mantenha apenas código e termos técnicos (nomes de funções, variáveis, comandos, etc.) em inglês.

## Rotina de manutenção e segurança

- **Antes de alterar código**: rode `npm run check:repo` (branch, `git status`, e se o
  `DATABASE_URL` local aponta para o host de produção do Neon). Já roda sozinho no início da
  sessão via hook; se a branch não for a esperada ou o repo estiver sujo, confirme com o usuário
  antes de prosseguir. O ambiente local usa a branch `dev-local` do Neon — nunca a `production`.
- **Depois de alterar código**: rode `npm run lint`, `npm run typecheck` e `npm run build:app`
  (build sem `prisma migrate deploy` — use `npm run build` completo só quando a mudança envolver
  schema/migration). Zero warnings novos em relação ao estado anterior.
- **Antes de cada push**: um hook já bloqueia automaticamente (`npm run scan:secrets`) se achar um
  segredo real de `.env.local`/`.env` ou um padrão genérico de segredo no que seria enviado.
  Nunca contorne esse bloqueio sem ter certeza absoluta de que é falso positivo — se tiver,
  explique ao usuário antes de prosseguir.
- **Depois de cada deploy em produção**: rode `npm run check:deploy` (status do deploy na Vercel,
  home do painel e da loja, uma página de produto e uma listagem por categoria, a rota
  `comprar-whatsapp` — deve redirecionar, nunca 500 — e os logs de erro recentes).
- **Semanal/mensal**: coberto por agentes agendados (dependências/vulnerabilidades, arquivos
  temporários, variáveis de ambiente não usadas, código morto; revisão mensal de permissões,
  integrações, variáveis Vercel/Neon, custos e performance). Não repita manualmente — só age em
  cima do relatório se o agendamento ainda não tiver rodado.
- **Fim de sessão**: resuma no chat o que mudou (arquivos, commits, testes rodados, riscos e
  pendências) e acrescente o mesmo resumo em `docs/relatorios-sessao.md`. Só commite esse arquivo
  (ou qualquer outro) se o usuário pedir.
- **Princípio geral**: não mexer no que funciona sem necessidade. Preferir mudanças pequenas e
  fáceis de reverter — e para qualquer mudança de alto impacto (schema, fluxo de pagamento/pedido,
  configuração de domínio/DNS, variáveis de ambiente de produção), explicar o plano e pedir
  confirmação antes de aplicar.

@AGENTS.md
