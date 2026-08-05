"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/lib/session";
import { canManageSettings } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditAction } from "@/modules/audit/audit-service";
import type { DeviceStatus } from "@/generated/prisma/enums";

/**
 * Aprovar, recusar e revogar são a mesma operação de fundo (mudar `status` +
 * registrar quem/quando + auditoria) — só o status final, o texto e o código de
 * auditoria mudam. Centralizado aqui pra não repetir o guard de "não mexer no
 * próprio dispositivo" três vezes.
 */
async function changeDeviceStatus(
  deviceId: string,
  status: DeviceStatus,
  auditAction: AuditAction,
  actionLabel: string
) {
  const actor = await requireUser();
  if (!canManageSettings(actor.role)) {
    return { error: "Seu perfil não tem permissão para gerenciar dispositivos." };
  }

  const sessionUser = await getCurrentUser();
  if (sessionUser?.deviceId === deviceId) {
    return { error: "Você não pode alterar o dispositivo que está usando agora." };
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, tenantId: actor.tenantId },
  });
  if (!device) return { error: "Dispositivo não encontrado." };

  await prisma.device.update({
    where: { id: device.id },
    data: { status, statusChangedById: actor.id, statusChangedAt: new Date() },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    userName: actor.name ?? actor.email ?? "Usuário",
    action: auditAction,
    entity: "Device",
    entityId: device.id,
    description: `${actionLabel} o dispositivo ${device.id} (IP ${device.ipAddress ?? "desconhecido"}).`,
  });

  revalidatePath("/dispositivos");
  return { success: `Dispositivo ${actionLabel.toLowerCase()}.` };
}

export async function approveDeviceAction(deviceId: string) {
  return changeDeviceStatus(deviceId, "APPROVED", "device.approve", "Aprovou");
}

export async function rejectDeviceAction(deviceId: string) {
  return changeDeviceStatus(deviceId, "REJECTED", "device.reject", "Recusou");
}

export async function revokeDeviceAction(deviceId: string) {
  return changeDeviceStatus(deviceId, "REJECTED", "device.revoke", "Revogou");
}
