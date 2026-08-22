import type { UserRole } from "@/generated/prisma/enums";

/**
 * Regras de permissão por papel.
 *
 * No MVP as permissões são derivadas diretamente do papel do usuário.
 * A tabela de permissões customizadas por usuário está prevista para a Fase 8;
 * quando existir, estas funções passam a consultá-la antes de cair no papel.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SELLER: "Vendedor",
  STOCKIST: "Estoquista",
  STOCK_COLLABORATOR: "Colaborador de Estoque",
};

/** Vender no PDV. */
export function canSell(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "SELLER";
}

/**
 * Ver o Dashboard (resumo do dia, indicadores, produtos a repor).
 * Vendedor não vê — o trabalho dele começa e termina no PDV/Troca, sem
 * precisar dos números gerais da empresa.
 */
export function canViewDashboard(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "STOCKIST";
}

/**
 * Conceder desconto numa venda.
 * Vendedores não podem — evita desconto sem autorização no balcão.
 */
export function canApplyDiscount(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Desconto livre na película 3D, sem depender de capinha no carrinho.
 * Diferente de `canApplyDiscount` (Admin e Gerente descontam qualquer outro
 * item livremente): a trava de capinha (`seller-discount-rules.ts`) vale
 * também pro Gerente, só ADMIN é dispensado dela.
 */
export function canDiscountFreely(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Cancelar uma venda já concluída (devolve o estoque).
 * Vendedor também pode — é o caminho pra processar uma troca (cancela a
 * venda original e lança uma nova no PDV). Fica rastreado no registro de
 * atividades, então dá pra auditar sem travar o balcão numa aprovação.
 */
export function canCancelSale(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "SELLER";
}

/**
 * Corrigir preço/desconto de um item de uma venda já concluída (sem trocar
 * produto, sem mudar o total cobrado). Só ADMIN — diferente de cancelar
 * (que Vendedor/Gerente também fazem), editar reescreve um fato já
 * registrado, então fica restrito a quem responde pela empresa.
 */
export function canEditSale(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Ver a listagem geral de vendas (histórico completo, qualquer data).
 * Vendedor não tem esse acesso — pra achar uma venda antiga (ex.: pra
 * trocar um produto) ele usa a busca por número do cupom em /vendas/buscar.
 */
export function canViewAllSales(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Abrir e fechar o caixa. */
export function canManageCashRegister(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "SELLER";
}

/** Registrar sangria e suprimento. */
export function canMoveCash(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Cadastrar e editar produtos. */
export function canManageProducts(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "STOCKIST";
}

/** Lançar movimentações de estoque. */
export function canManageStock(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "STOCKIST";
}

/** Ver relatórios financeiros e de desempenho. */
export function canViewReports(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Gerenciar usuários e configurações da empresa. */
export function canManageSettings(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Configurar a Oferta Relâmpago (dia, produto, preço, ativação). Gerente
 * também pode, diferente do restante de "Configurações" — é uma decisão
 * comercial do dia a dia, não uma configuração estrutural da empresa.
 */
export function canManageFlashDeals(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Registrar e acompanhar ordens de serviço de assistência técnica. */
export function canManageRepairOrders(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER" || role === "SELLER";
}

/**
 * Ver e editar o preço de custo (e o lucro) de uma OS a qualquer momento,
 * inclusive depois de criada e em relatórios. Só o administrador.
 */
export function canManageRepairOrderCostAnytime(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Informar o preço de custo no instante em que a OS é criada.
 * Gerente tem esse acesso só na criação — depois de salva, só ADMIN vê/edita
 * (ver canManageRepairOrderCostAnytime).
 */
export function canEnterRepairOrderCostOnCreate(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Dispensar o saldo pendente de uma OS sem cobrança (cortesia), na entrega.
 * Mesmo nível de restrição de `canManageFiado`: nem Gerente decide sozinho
 * abrir mão de um valor a receber — sempre exige justificativa (ver
 * `grantRepairOrderCourtesy`).
 */
export function canGrantRepairOrderCourtesy(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Acesso restrito à tela de ajuste rápido de estoque (foto + quantidade,
 * sem preço nem qualquer outra informação do produto).
 */
export function isStockCollaborator(role: UserRole) {
  return role === "STOCK_COLLABORATOR";
}

/** Quem pode usar a tela de ajuste rápido de estoque — o colaborador dedicado, ou quem já gerencia estoque. */
export function canQuickEditStockQty(role: UserRole) {
  return isStockCollaborator(role) || canManageStock(role);
}

/**
 * Reiniciar o ciclo de contagem do Colaborador de Estoque (zera a marcação de
 * "já conferido" de todos os produtos, enchendo a fila dele de novo).
 */
export function canResetStockCheckQueue(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Corrigir manualmente uma marcação de ponto de outro colaborador. O próprio
 * colaborador nunca pode alterar o que já registrou — só quem tem este papel.
 */
export function canCorrectAttendance(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Registrar o próprio ponto sem selfie (câmera indisponível/sem permissão),
 * mediante motivo obrigatório. Bater ponto em si é universal a qualquer
 * usuário autenticado — esta função só libera a exceção da foto.
 */
export function canWaiveAttendanceSelfie(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Ver o painel de ponto de todos os colaboradores (presença, atrasos, horas). */
export function canViewAttendancePanel(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Lançar, listar e marcar como pago um fiado (venda "na confiança", cliente
 * paga depois) — inclusive escolher "Fiado" como forma de pagamento no PDV, e
 * conceder crédito de loja manualmente. Só ADMIN, diferente da maioria das
 * outras permissões: nem Gerente pode conceder crédito por conta própria.
 */
export function canManageFiado(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Painel de Colaboradores — lançar e quitar adiantamento de salário e
 * compra de mercadoria descontada em folha. Admin e Gerente, diferente do
 * Fiado (só ADMIN): aqui é controle interno da equipe, não crédito
 * concedido a cliente externo.
 */
export function canManageEmployeeLedger(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Editar a porcentagem de comissão de venda — a geral (painel de
 * Colaboradores) e a individual por produto. Diferente do resto de
 * `canManageEmployeeLedger`: Gerente continua lançando/quitando adiantamento
 * e compra normalmente, mas só visualiza a comissão, sem poder alterá-la —
 * só ADMIN decide quanto cada um ganha.
 */
export function canEditCommission(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Mesclar dois cadastros de cliente duplicados (ex.: um criado no PDV e outro
 * pelo próprio cliente no catálogo online). Reatribui vendas, pedidos, fiado,
 * crédito de loja e login de um cadastro pro outro, e apaga o absorvido —
 * irreversível, por isso só ADMIN.
 */
export function canMergeCustomers(role: UserRole) {
  return role === "ADMIN";
}

/**
 * Cadastrar convênios corporativos (empresa parceira), gerar/gerenciar o
 * link de convite, e aprovar, suspender, bloquear ou cancelar colaboradores
 * vinculados. Admin e Gerente — nenhum acesso separado pra empresa parceira
 * nesta fase (ver decisão registrada no plano do módulo).
 */
export function canManageConvenios(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/**
 * Validar manualmente os cadastros de Proteção Eficaz (comparar a foto da
 * nota do cliente com o rascunho da venda, aprovar/rejeitar, marcar como
 * trocado). Só ADMIN — é o próprio dono quem faz essa conferência.
 */
export function canManageProtecaoEficaz(role: UserRole) {
  return role === "ADMIN";
}
