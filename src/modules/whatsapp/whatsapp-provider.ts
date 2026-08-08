/**
 * Abstração da integração com WhatsApp. A camada de domínio (services/actions
 * das próximas fases) depende só desta interface, nunca de detalhes da Graph
 * API da Meta diretamente — permite trocar/evoluir o provider sem espalhar
 * chamadas HTTP pelo projeto (missão: seção 10).
 */

export type SendTextMessageInput = {
  /** Número de destino em E.164, sem "+" (ex.: "5511999998888"). */
  toPhoneE164: string;
  text: string;
};

export type SendMediaMessageInput = {
  toPhoneE164: string;
  mediaUrl: string;
  mediaType: "image" | "audio" | "video" | "document" | "sticker";
  caption?: string;
  fileName?: string;
};

export type SendMessageResult =
  | { ok: true; externalId: string }
  | { ok: false; error: string };

export type MarkAsReadInput = {
  /** `wamid` da mensagem recebida que está sendo confirmada como lida. */
  externalMessageId: string;
};

/** Mensagem recebida, já normalizada a partir do payload bruto da Meta. */
export type InboundMessageEvent = {
  kind: "inbound_message";
  /** ID do número de telefone da loja que recebeu (resolve o tenant). */
  phoneNumberId: string;
  fromPhoneE164: string;
  profileName?: string;
  externalId: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "interactive"
    | "unknown";
  textBody?: string;
  mediaId?: string;
  mediaMimeType?: string;
  timestamp: Date;
};

/** Atualização de status de uma mensagem que a loja enviou. */
export type MessageStatusEvent = {
  kind: "message_status";
  phoneNumberId: string;
  externalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorMessage?: string;
  timestamp: Date;
};

export type ParsedWebhookEvent = InboundMessageEvent | MessageStatusEvent;

export type DownloadedMedia = {
  buffer: Buffer;
  mimeType: string;
};

/**
 * Só os métodos que dependem de credenciais de um tenant específico ficam
 * aqui. Parsing do payload do webhook e verificação de assinatura são
 * responsabilidade global do App da Meta (um único `WHATSAPP_APP_SECRET`
 * para todos os tenants) — vivem como funções soltas em
 * `meta-cloud-api-provider.ts`, não como método de instância.
 */
export interface WhatsAppProvider {
  sendTextMessage(input: SendTextMessageInput): Promise<SendMessageResult>;
  sendMediaMessage(input: SendMediaMessageInput): Promise<SendMessageResult>;
  markAsRead(input: MarkAsReadInput): Promise<void>;
  /** Baixa uma mídia recebida (`mediaId` do webhook) para rehospedar. `null` em qualquer falha — nunca lança. */
  downloadMedia(mediaId: string): Promise<DownloadedMedia | null>;
}

export class WhatsAppNotConfiguredError extends Error {
  constructor(tenantId: string) {
    super(`Integração de WhatsApp não configurada ou desativada para o tenant ${tenantId}.`);
    this.name = "WhatsAppNotConfiguredError";
  }
}
