import { NextResponse } from "next/server";
import { parseMetaWebhookPayload, validateMetaWebhookSignature } from "@/modules/whatsapp/meta-cloud-api-provider";
import { processWebhookEvent } from "@/modules/whatsapp/inbound-message-service";

/**
 * Handshake de verificação do webhook, exigido pela Meta ao cadastrar o
 * Callback URL no painel do App. `WHATSAPP_WEBHOOK_VERIFY_TOKEN` é global
 * (um único App/webhook para todos os tenants — ver decisão na Fase 1).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && challenge && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse(null, { status: 403 });
}

/**
 * Recebe mensagens e atualizações de status. Sempre responde rápido (200 se
 * processou, 401 se a assinatura não bateu) — nunca deixa uma exceção subir:
 * a Meta reenvia e pode até desativar o webhook depois de falhas repetidas.
 * Mesmo espírito defensivo de `src/app/api/track/route.ts`.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!validateMetaWebhookSignature(rawBody, signature)) {
    console.error("[whatsapp webhook] assinatura inválida ou ausente");
    return new NextResponse(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Corpo assinado corretamente mas não é JSON válido — nunca deveria
    // acontecer vindo da Meta; responde 200 mesmo assim para não gerar
    // reenvios de algo que nunca vai ficar válido.
    return new NextResponse(null, { status: 200 });
  }

  const events = parseMetaWebhookPayload(payload);
  for (const event of events) {
    await processWebhookEvent(event).catch((error) => {
      console.error("[whatsapp webhook] falha ao processar evento", error);
    });
  }

  return new NextResponse(null, { status: 200 });
}
