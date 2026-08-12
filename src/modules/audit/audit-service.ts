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
  | "sale.item_defect"
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
  | "attendance.selfie_waived";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "sale.cancel": "Venda cancelada",
  "sale.item_defect": "Troca por defeito registrada",
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
  "attendance.selfie_waived": "Marcação de ponto registrada sem selfie",
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
