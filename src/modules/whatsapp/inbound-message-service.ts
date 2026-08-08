import { put } from "@vercel/blob";
import { Prisma } from "@/generated/prisma/client";
import type { WhatsAppMessageStatus, WhatsAppMessageType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "./customer-matcher";
import { normalizeToE164 } from "./phone-normalizer";
import { getWhatsAppProviderByPhoneNumberId } from "./get-whatsapp-provider";
import type { InboundMessageEvent, MessageStatusEvent, ParsedWebhookEvent, WhatsAppProvider } from "./whatsapp-provider";

/**
 * Ponto de entrada do processamento de um evento já normalizado do webhook
 * (ver `meta-cloud-api-provider.ts#parseMetaWebhookPayload`). Resolve o
 * tenant a partir do `phoneNumberId` e delega para o handler certo. Nunca
 * lança — falhas ficam só no log, o chamador (`route.ts`) responde 200 pra
 * Meta de qualquer forma (reenviar não deve travar o webhook inteiro).
 */
export async function processWebhookEvent(event: ParsedWebhookEvent): Promise<void> {
  const resolved = await getWhatsAppProviderByPhoneNumberId(event.phoneNumberId);
  if (!resolved) {
    console.error(
      `[whatsapp webhook] número ${event.phoneNumberId} não corresponde a nenhuma integração configurada.`,
    );
    return;
  }

  if (event.kind === "inbound_message") {
    await handleInboundMessage(resolved.tenantId, resolved.provider, event);
  } else {
    await handleMessageStatus(resolved.tenantId, event);
  }
}

async function handleInboundMessage(
  tenantId: string,
  provider: WhatsAppProvider,
  event: InboundMessageEvent,
): Promise<void> {
  const phoneE164 = normalizeToE164(event.fromPhoneE164) ?? event.fromPhoneE164;

  const contact = await prisma.whatsAppContact.upsert({
    where: { tenantId_phoneE164: { tenantId, phoneE164 } },
    update: event.profileName ? { profileName: event.profileName } : {},
    create: {
      tenantId,
      phoneE164,
      profileName: event.profileName,
      customerId: await findCustomerByPhone(tenantId, phoneE164),
    },
  });

  const conversation = await findOrReopenConversation(tenantId, contact.id);

  const media = event.mediaId ? await downloadAndStoreMedia(provider, tenantId, event) : null;

  try {
    await prisma.$transaction([
      prisma.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          direction: "INBOUND",
          externalId: event.externalId,
          type: mapMessageType(event.type),
          textBody: event.textBody ?? null,
          mediaUrl: media?.url ?? null,
          mediaMimeType: media?.mimeType ?? event.mediaMimeType ?? null,
          status: "RECEIVED",
        },
      }),
      prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: event.timestamp,
          lastMessagePreview: buildPreview(event),
          unreadCount: { increment: 1 },
        },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Reentrega do mesmo webhook pela Meta — a mensagem já foi persistida
      // numa tentativa anterior. Idempotência via `@@unique([tenantId, externalId])`.
      return;
    }
    throw error;
  }
}

async function handleMessageStatus(tenantId: string, event: MessageStatusEvent): Promise<void> {
  // `updateMany` (não `update`): um status pode chegar para uma mensagem que
  // este tenant ainda nem tem registrada (normal até a Fase 4 implementar o
  // envio) — nesse caso é um no-op silencioso, não um erro.
  await prisma.whatsAppMessage.updateMany({
    where: { tenantId, externalId: event.externalId },
    data: {
      status: mapStatus(event.status),
      errorMessage: event.errorMessage ?? null,
    },
  });
}

/** Reaproveita a conversa mais recente do contato (reabrindo se estiver fechada) ou cria uma nova. */
async function findOrReopenConversation(tenantId: string, contactId: string) {
  const latest = await prisma.whatsAppConversation.findFirst({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) {
    return prisma.whatsAppConversation.create({ data: { tenantId, contactId } });
  }
  if (latest.status === "CLOSED") {
    return prisma.whatsAppConversation.update({ where: { id: latest.id }, data: { status: "OPEN" } });
  }
  return latest;
}

/**
 * Baixa a mídia da Meta (URL temporária, ~5 min) e rehospeda no Vercel Blob —
 * mesmo padrão de `receipt-service.tsx`. Best-effort: qualquer falha devolve
 * `null` e a mensagem é salva do mesmo jeito, só sem `mediaUrl`.
 */
async function downloadAndStoreMedia(
  provider: WhatsAppProvider,
  tenantId: string,
  event: InboundMessageEvent,
): Promise<{ url: string; mimeType: string } | null> {
  if (!event.mediaId) return null;

  const media = await provider.downloadMedia(event.mediaId);
  if (!media) return null;

  try {
    const uploaded = await put(`whatsapp-media/${tenantId}/${event.externalId}`, media.buffer, {
      access: "public",
      contentType: media.mimeType,
      addRandomSuffix: false,
    });
    return { url: uploaded.url, mimeType: media.mimeType };
  } catch {
    return null;
  }
}

const MESSAGE_TYPE_MAP: Record<InboundMessageEvent["type"], WhatsAppMessageType> = {
  text: "TEXT",
  image: "IMAGE",
  audio: "AUDIO",
  video: "VIDEO",
  document: "DOCUMENT",
  sticker: "STICKER",
  location: "LOCATION",
  interactive: "INTERACTIVE",
  unknown: "UNKNOWN",
};

function mapMessageType(type: InboundMessageEvent["type"]): WhatsAppMessageType {
  return MESSAGE_TYPE_MAP[type];
}

const STATUS_MAP: Record<MessageStatusEvent["status"], WhatsAppMessageStatus> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

function mapStatus(status: MessageStatusEvent["status"]): WhatsAppMessageStatus {
  return STATUS_MAP[status];
}

const MEDIA_TYPE_LABELS: Partial<Record<InboundMessageEvent["type"], string>> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  interactive: "Mensagem interativa",
  unknown: "Mensagem não suportada",
};

function buildPreview(event: InboundMessageEvent): string {
  if (event.type === "text") {
    const text = event.textBody ?? "";
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  return MEDIA_TYPE_LABELS[event.type] ?? "Mensagem";
}
