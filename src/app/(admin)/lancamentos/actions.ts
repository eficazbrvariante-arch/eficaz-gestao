"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/format";
import { recordAudit } from "@/modules/audit/audit-service";
import { createEmployeeLedgerEntry } from "@/modules/employees/employee-ledger-service";
import {
  createSelfServiceLedgerEntrySchema,
  EMPLOYEE_LEDGER_TYPE_LABELS,
  type CreateSelfServiceLedgerEntryInput,
} from "@/lib/validations/employee-ledger";

/**
 * Lançamento feito pelo próprio colaborador (adiantamento/mercadoria que ele
 * pegou), de qualquer login da loja — mesmo modelo do Ponto: escolhe o
 * próprio nome numa lista e a selfie tirada na hora é a "assinatura". Entra
 * PENDENTE em Colaboradores e é descontado no próximo Pagamento por horas.
 */
export async function createSelfServiceLedgerEntryAction(
  input: CreateSelfServiceLedgerEntryInput
): Promise<{ error: string } | { success: string }> {
  const user = await requireUser();

  const parsed = createSelfServiceLedgerEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const employee = await prisma.user.findFirst({
    where: { id: parsed.data.userId, tenantId: user.tenantId, active: true },
    select: { id: true, name: true },
  });
  if (!employee) return { error: "Selecione um colaborador válido." };

  const result = await createEmployeeLedgerEntry(
    { tenantId: user.tenantId, createdById: user.id },
    {
      userId: employee.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
    },
    parsed.data.selfieUrl
  );
  if (!result.ok) return { error: result.error };

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Usuário",
    action: "employee_ledger.self_service_create",
    entity: "EmployeeLedgerEntry",
    entityId: result.id,
    description: `${employee.name} lançou ${EMPLOYEE_LEDGER_TYPE_LABELS[parsed.data.type]} de ${formatBRL(result.amount)} com selfie (${parsed.data.description}).`,
  });

  revalidatePath("/colaboradores");
  revalidatePath(`/colaboradores/${employee.id}/horas`);
  return { success: `Lançamento de ${formatBRL(result.amount)} registrado para ${employee.name}.` };
}
