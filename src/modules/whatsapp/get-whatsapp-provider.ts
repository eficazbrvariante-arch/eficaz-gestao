import { prisma } from "@/lib/prisma";
import { decryptSecret } from "./token-crypto";
import { WhatsAppNotConfiguredError, type WhatsAppProvider } from "./whatsapp-provider";
import { MetaCloudApiProvider } from "./meta-cloud-api-provider";

/**
 * Resolve o provider de WhatsApp configurado para um tenant. Usada pelas
 * próximas fases (envio de mensagem, confirmação de leitura) — nada nesta
 * fase ainda chama esta função.
 */
export async function getWhatsAppProvider(tenantId: string): Promise<WhatsAppProvider> {
  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { tenantId },
    select: { phoneNumberId: true, accessToken: true, status: true },
  });

  if (!integration || integration.status === "DISABLED") {
    throw new WhatsAppNotConfiguredError(tenantId);
  }

  return new MetaCloudApiProvider({
    phoneNumberId: integration.phoneNumberId,
    accessToken: decryptSecret(integration.accessToken),
  });
}

/**
 * Resolve tenant + provider a partir do `phone_number_id` que vem no payload
 * do webhook (é globalmente único na Meta) — usada pelo processamento de
 * eventos recebidos, que ainda não sabe de qual tenant é a mensagem até olhar
 * esse campo. `null` quando o número não corresponde a nenhuma integração
 * conhecida (webhook de um número não configurado, ou já desativado).
 */
export async function getWhatsAppProviderByPhoneNumberId(
  phoneNumberId: string,
): Promise<{ tenantId: string; provider: WhatsAppProvider } | null> {
  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { phoneNumberId },
    select: { tenantId: true, accessToken: true, status: true },
  });

  if (!integration || integration.status === "DISABLED") {
    return null;
  }

  return {
    tenantId: integration.tenantId,
    provider: new MetaCloudApiProvider({
      phoneNumberId,
      accessToken: decryptSecret(integration.accessToken),
    }),
  };
}
