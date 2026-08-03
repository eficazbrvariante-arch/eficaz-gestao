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
 * Conceder desconto numa venda.
 * Vendedores não podem — evita desconto sem autorização no balcão.
 */
export function canApplyDiscount(role: UserRole) {
  return role === "ADMIN" || role === "MANAGER";
}

/** Cancelar uma venda já concluída (devolve o estoque). */
export function canCancelSale(role: UserRole) {
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
