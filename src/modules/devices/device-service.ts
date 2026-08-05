import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";

/**
 * `code` é o que diferencia esses erros de senha errada (`CredentialsSignin` comum,
 * `code: "credentials"`) e entre si — ver `performCredentialsLogin` em
 * `src/app/(auth)/actions.ts`, que faz o switch por `error.code` (nunca `error.type`,
 * que é sempre `"CredentialsSignin"` para qualquer um destes).
 */
export class DevicePendingError extends CredentialsSignin {
  code = "device_pending";
}

export class DeviceRejectedError extends CredentialsSignin {
  code = "device_rejected";
}

export class DeviceConflictError extends CredentialsSignin {
  code = "device_conflict";
}

/**
 * Confere (e, se for a primeira vez, cria) o registro de dispositivo do login atual.
 * Chamada só depois que a senha já bateu (nunca antes — checar dispositivo antes da
 * senha deixaria qualquer um poluir a fila de pendentes sem saber senha nenhuma).
 *
 * Bootstrap: se o tenant nunca teve NENHUM dispositivo (qualquer status, não só
 * aprovados — ver comentário no schema), o primeiro login aprova esse dispositivo na
 * hora. Isso cobre tanto uma empresa recém-cadastrada quanto uma empresa já existente
 * usando essa tela pela primeira vez, sem travar ninguém de fora.
 */
export async function resolveDeviceForLogin({
  tenantId,
  deviceId,
  ipAddress,
  userAgent,
  requestedByUserId,
}: {
  tenantId: string;
  deviceId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestedByUserId: string;
}) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });

  if (device) {
    if (device.tenantId !== tenantId) throw new DeviceConflictError();
    if (device.status === "APPROVED") {
      await prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      });
      return device;
    }
    if (device.status === "PENDING") throw new DevicePendingError();
    throw new DeviceRejectedError();
  }

  const isBootstrap = (await prisma.device.count({ where: { tenantId } })) === 0;

  const created = await prisma.device.create({
    data: {
      id: deviceId,
      tenantId,
      status: isBootstrap ? "APPROVED" : "PENDING",
      ipAddress,
      userAgent,
      requestedByUserId,
      statusChangedAt: isBootstrap ? new Date() : null,
      lastSeenAt: isBootstrap ? new Date() : null,
    },
  });

  if (!isBootstrap) throw new DevicePendingError();
  return created;
}
