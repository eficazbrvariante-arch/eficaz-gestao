import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  DownloadedMedia,
  InboundMessageEvent,
  MarkAsReadInput,
  MessageStatusEvent,
  ParsedWebhookEvent,
  SendMediaMessageInput,
  SendMessageResult,
  SendTextMessageInput,
  WhatsAppProvider,
} from "./whatsapp-provider";

const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";

type MetaCloudApiProviderConfig = {
  phoneNumberId: string;
  /** Access token já descriptografado (ver `get-whatsapp-provider.ts`) — esta classe não conhece `token-crypto`. */
  accessToken: string;
};

/**
 * Implementação concreta de `WhatsAppProvider` sobre a WhatsApp Business
 * Cloud API da Meta. Único lugar do projeto que fala HTTP com
 * `graph.facebook.com` — tudo o mais chama a interface `WhatsAppProvider`.
 */
export class MetaCloudApiProvider implements WhatsAppProvider {
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(config: MetaCloudApiProviderConfig) {
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.baseUrl = process.env.WHATSAPP_GRAPH_API_BASE_URL ?? DEFAULT_BASE_URL;
    this.apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? DEFAULT_API_VERSION;
  }

  private endpoint(path: string): string {
    return `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/${path}`;
  }

  private async post(body: Record<string, unknown>): Promise<SendMessageResult> {
    try {
      const response = await fetch(this.endpoint("messages"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message = extractGraphErrorMessage(payload) ?? `Falha ao enviar mensagem (HTTP ${response.status}).`;
        return { ok: false, error: message };
      }

      const externalId = extractSentMessageId(payload);
      if (!externalId) {
        return { ok: false, error: "Resposta da Meta sem id de mensagem." };
      }
      return { ok: true, externalId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Erro desconhecido ao chamar a Graph API." };
    }
  }

  async sendTextMessage(input: SendTextMessageInput): Promise<SendMessageResult> {
    return this.post({
      to: input.toPhoneE164,
      type: "text",
      text: { body: input.text },
    });
  }

  async sendMediaMessage(input: SendMediaMessageInput): Promise<SendMessageResult> {
    return this.post({
      to: input.toPhoneE164,
      type: input.mediaType,
      [input.mediaType]: {
        link: input.mediaUrl,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.fileName ? { filename: input.fileName } : {}),
      },
    });
  }

  async markAsRead(input: MarkAsReadInput): Promise<void> {
    await fetch(this.endpoint("messages"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: input.externalMessageId,
      }),
    }).catch(() => {
      // Confirmação de leitura é cosmética (double-check azul) — nunca deve
      // derrubar o fluxo de atendimento se a Meta estiver instável.
    });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia | null> {
    try {
      const metaResponse = await fetch(`${this.baseUrl}/${this.apiVersion}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!metaResponse.ok) return null;

      const meta: unknown = await metaResponse.json();
      if (!isRecord(meta) || typeof meta.url !== "string" || typeof meta.mime_type !== "string") return null;

      const fileResponse = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!fileResponse.ok) return null;

      const arrayBuffer = await fileResponse.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
    } catch {
      return null;
    }
  }
}

/** Valida a assinatura `X-Hub-Signature-256` do corpo bruto da requisição do webhook. Função solta (não de instância): a verificação usa `WHATSAPP_APP_SECRET`, único para todos os tenants — não depende de nenhuma credencial por tenant. */
export function validateMetaWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice(expectedPrefix.length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

// ---------------------------------------------------------------------------
// Parsing defensivo do payload da Meta — nunca confia cegamente no formato
// recebido (missão: seção 11). Qualquer campo fora do esperado é ignorado em
// vez de lançar.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSentMessageId(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return null;
  const first = payload.messages[0];
  if (!isRecord(first) || typeof first.id !== "string") return null;
  return first.id;
}

function extractGraphErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const message = payload.error.message;
  return typeof message === "string" ? message : null;
}

const KNOWN_MESSAGE_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "interactive",
]);

/** Converte o payload bruto do webhook da Meta em eventos normalizados. Nunca lança para payload inesperado — eventos não reconhecidos são omitidos. */
export function parseMetaWebhookPayload(rawPayload: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];
  if (!isRecord(rawPayload) || !Array.isArray(rawPayload.entry)) return events;

  for (const entry of rawPayload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value;
      if (!isRecord(value.metadata) || typeof value.metadata.phone_number_id !== "string") continue;
      const phoneNumberId = value.metadata.phone_number_id;

      const profileByWaId = new Map<string, string | undefined>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (!isRecord(contact) || typeof contact.wa_id !== "string") continue;
          const profile = isRecord(contact.profile) ? contact.profile.name : undefined;
          profileByWaId.set(contact.wa_id, typeof profile === "string" ? profile : undefined);
        }
      }

      if (Array.isArray(value.messages)) {
        for (const message of value.messages) {
          const event = parseInboundMessage(message, phoneNumberId, profileByWaId);
          if (event) events.push(event);
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          const event = parseMessageStatus(status, phoneNumberId);
          if (event) events.push(event);
        }
      }
    }
  }

  return events;
}

function parseInboundMessage(
  message: unknown,
  phoneNumberId: string,
  profileByWaId: Map<string, string | undefined>,
): InboundMessageEvent | null {
  if (!isRecord(message)) return null;
  const { id, from, type, timestamp } = message;
  if (typeof id !== "string" || typeof from !== "string" || typeof type !== "string") return null;

  const normalizedType = KNOWN_MESSAGE_TYPES.has(type) ? (type as InboundMessageEvent["type"]) : "unknown";

  let textBody: string | undefined;
  if (normalizedType === "text" && isRecord(message.text) && typeof message.text.body === "string") {
    textBody = message.text.body;
  }

  let mediaId: string | undefined;
  let mediaMimeType: string | undefined;
  const mediaContainer = isRecord(message[normalizedType]) ? message[normalizedType] : null;
  if (mediaContainer) {
    if (typeof mediaContainer.id === "string") mediaId = mediaContainer.id;
    if (typeof mediaContainer.mime_type === "string") mediaMimeType = mediaContainer.mime_type;
  }

  return {
    kind: "inbound_message",
    phoneNumberId,
    fromPhoneE164: from,
    profileName: profileByWaId.get(from),
    externalId: id,
    type: normalizedType,
    textBody,
    mediaId,
    mediaMimeType,
    timestamp: parseUnixSeconds(timestamp),
  };
}

const KNOWN_STATUS_VALUES = new Set(["sent", "delivered", "read", "failed"]);

function parseMessageStatus(status: unknown, phoneNumberId: string): MessageStatusEvent | null {
  if (!isRecord(status)) return null;
  const { id, status: statusValue, timestamp } = status;
  if (typeof id !== "string" || typeof statusValue !== "string") return null;
  if (!KNOWN_STATUS_VALUES.has(statusValue)) return null;

  let errorMessage: string | undefined;
  if (Array.isArray(status.errors) && isRecord(status.errors[0]) && typeof status.errors[0].title === "string") {
    errorMessage = status.errors[0].title;
  }

  return {
    kind: "message_status",
    phoneNumberId,
    externalId: id,
    status: statusValue as MessageStatusEvent["status"],
    errorMessage,
    timestamp: parseUnixSeconds(timestamp),
  };
}

function parseUnixSeconds(value: unknown): Date {
  const seconds = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}
