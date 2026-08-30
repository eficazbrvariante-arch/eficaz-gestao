import { prisma } from "@/lib/prisma";

/**
 * Registro das ações sensíveis do painel.
 *
 * Nunca deve derrubar a operação que está sendo auditada: se a gravação do log
 * falhar, a venda/cancelamento/alteração já aconteceu e o certo é seguir em
 * frente, não desfazer o trabalho do usuário por causa do histórico.
 */

export type AuditAction =
  | "sale.cancel"
  | "sale.edit"
  | "sale.item_defect"
  | "customer.merge"
  | "customer.credit_adjust"
  | "order.status_change"
  | "order.cancel"
  | "stock.adjust"
  | "stock.inventory"
  | "stock.recount_reset"
  | "user.create"
  | "user.role_change"
  | "user.deactivate"
  | "user.activate"
  | "user.password_reset"
  | "settings.company"
  | "settings.catalog"
  | "settings.delivery"
  | "settings.domain"
  | "product.delete"
  | "device.approve"
  | "device.reject"
  | "device.revoke"
  | "attendance.correct"
  | "attendance.add_missing"
  | "attendance.selfie_waived"
  | "repair.payment_received"
  | "repair.delivered"
  | "repair.courtesy_grant"
  | "repair.cancel_without_billing"
  | "employee_ledger.confirm_paid"
  | "employee_ledger.delete"
  | "commission.tiers_update"
  | "commission.pdv_ranking_toggle"
  | "credito_eficaz.approve"
  | "credito_eficaz.reject"
  | "credito_eficaz.info_request"
  | "credito_eficaz.limit_change"
  | "credito_eficaz.block"
  | "credito_eficaz.unblock"
  | "credito_eficaz.payment"
  | "credito_eficaz.pin_reset"
  | "credito_eficaz.exposure_limit_change"
  | "credito_eficaz.pause_toggle"
  | "credito_eficaz.max_installments_change";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "sale.cancel": "Venda cancelada",
  "sale.edit": "Preço/desconto de item corrigido em venda concluída",
  "sale.item_defect": "Troca por defeito registrada",
  "customer.merge": "Cadastros de cliente mesclados",
  "customer.credit_adjust": "Crédito de loja ajustado manualmente pelo Admin",
  "order.status_change": "Status de pedido alterado",
  "order.cancel": "Pedido cancelado",
  "stock.adjust": "Estoque ajustado",
  "stock.inventory": "Inventário aplicado",
  "stock.recount_reset": "Contagem de estoque reiniciada",
  "user.create": "Usuário criado",
  "user.role_change": "Papel de usuário alterado",
  "user.deactivate": "Usuário desativado",
  "user.activate": "Usuário reativado",
  "user.password_reset": "Senha redefinida",
  "settings.company": "Dados da empresa alterados",
  "settings.catalog": "Catálogo configurado",
  "settings.delivery": "Entrega configurada",
  "settings.domain": "Domínio alterado",
  "product.delete": "Produto excluído",
  "device.approve": "Dispositivo aprovado",
  "device.reject": "Dispositivo recusado",
  "device.revoke": "Dispositivo revogado",
  "attendance.correct": "Marcação de ponto corrigida",
  "attendance.add_missing": "Marcação de ponto faltante lançada",
  "attendance.selfie_waived": "Marcação de ponto registrada sem selfie",
  "repair.payment_received": "Pagamento recebido em OS de assistência técnica",
  "repair.delivered": "OS de assistência técnica entregue",
  "repair.courtesy_grant": "Cortesia concedida em OS de assistência técnica",
  "repair.cancel_without_billing": "OS cancelada sem faturamento",
  "employee_ledger.confirm_paid": "Pagamento confirmado por selfie pelo colaborador",
  "employee_ledger.delete": "Lançamento de colaborador excluído",
  "commission.tiers_update": "Faixas de comissão progressiva alteradas",
  "commission.pdv_ranking_toggle": "Ranking de Comissão no PDV ligado/desligado",
  "credito_eficaz.approve": "Solicitação de Crédito Eficaz aprovada",
  "credito_eficaz.reject": "Solicitação de Crédito Eficaz recusada",
  "credito_eficaz.info_request": "Informação adicional solicitada em pedido de Crédito Eficaz",
  "credito_eficaz.limit_change": "Limite de Crédito Eficaz alterado",
  "credito_eficaz.block": "Crédito Eficaz bloqueado",
  "credito_eficaz.unblock": "Crédito Eficaz desbloqueado",
  "credito_eficaz.payment": "Pagamento de Crédito Eficaz registrado",
  "credito_eficaz.pin_reset": "PIN de Crédito Eficaz redefinido pelo Admin",
  "credito_eficaz.exposure_limit_change": "Teto global do Crédito Eficaz alterado",
  "credito_eficaz.pause_toggle": "Crédito Eficaz pausado/despausado",
  "credito_eficaz.max_installments_change": "Máximo de parcelas do Crédito Eficaz alterado",
};

export type AuditEntry = {
  tenantId: string;
  userId: string;
  userName: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  description: string;
};

export async function recordAudit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        userName: entry.userName,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        description: entry.description,
      },
    });
  } catch {
    // Log é histórico, não regra de negócio: falhar aqui não pode desfazer
    // a ação que o usuário acabou de concluir.
  }
}

export async function listAuditLogs(tenantId: string, take = 200) {
  return prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
