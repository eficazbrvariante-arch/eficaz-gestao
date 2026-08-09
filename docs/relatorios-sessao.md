# Relatórios de sessão

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
