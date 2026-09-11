import { issueSignedToken, parseStoreIdFromDelegationToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";
import {
  getCreditoEficazBlobStoreId,
  getCreditoEficazBlobWebhookPublicKey,
} from "@/modules/credito-eficaz/credito-eficaz-blob";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAXIMUM_SIZE_IN_BYTES = 10 * 1024 * 1024;
/** O navegador usa a URL logo em seguida — 10 minutos cobre até conexão lenta. */
const SIGNED_TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * Upload de documento/selfie da solicitação de Crédito Eficaz — sempre
 * `access: 'private'`, no store privado `eficaz-documentos` (ver
 * `credito-eficaz-blob.ts`). Store privado autentica por OIDC, sem
 * read-write token, então o fluxo é o PRESIGNED (`handleUploadPresigned` +
 * `uploadPresigned` no componente), não o `handleUpload` dos stores públicos.
 * Vive DENTRO de `/loja/[subdomain]/...` de propósito, mesmo motivo de
 * `protecao-eficaz/upload`: o cookie de sessão do cliente é restrito a esse
 * prefixo quando a loja é acessada sem subdomínio próprio.
 *
 * Só emite a URL pré-assinada (válida pra UM pathname, só `put`) — o arquivo
 * nunca passa pelo servidor Next, vai direto do navegador pro Blob. Vincular
 * o pathname resultante a uma `CreditoEficazApplication` acontece depois,
 * numa server action (`addApplicationDocument`), nunca aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
): Promise<NextResponse> {
  const { subdomain } = await params;
  const body = (await request.json()) as HandleUploadPresignedBody;

  // Sem o store privado configurado, melhor recusar aqui, na hora, com
  // mensagem clara, do que deixar o navegador tentar e falhar sem explicação.
  const storeId = getCreditoEficazBlobStoreId();
  const webhookPublicKey = getCreditoEficazBlobWebhookPublicKey();
  if (!storeId || !webhookPublicKey) {
    console.error("[credito-eficaz/upload] CREDITO_BLOB_STORE_ID/WEBHOOK_PUBLIC_KEY não configurados");
    return NextResponse.json(
      { error: "Envio de documentos indisponível no momento. Tente mais tarde." },
      { status: 500 }
    );
  }

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey,
      getSignedToken: async (pathname) => {
        const store = await getStoreBySubdomain(subdomain);
        if (!store) throw new Error("Loja não encontrada.");
        const session = await getCustomerSession(store.id);
        if (!session) throw new Error("Faça login para enviar o documento.");

        const token = await issueSignedToken({
          storeId,
          pathname,
          operations: ["put"],
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAXIMUM_SIZE_IN_BYTES,
          validUntil: Date.now() + SIGNED_TOKEN_TTL_MS,
        });
        // Sem OIDC em runtime o SDK cai calado no `BLOB_READ_WRITE_TOKEN`
        // (store PÚBLICO) e o envio privado falharia no navegador, sem CORS
        // — confere aqui que o token saiu mesmo do store privado.
        if (parseStoreIdFromDelegationToken(token.delegationToken) !== storeId.replace(/^store_/, "")) {
          throw new Error("Credencial do armazenamento de documentos inválida.");
        }

        return {
          token,
          urlOptions: {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAXIMUM_SIZE_IN_BYTES,
            addRandomSuffix: true,
          },
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("[credito-eficaz/upload]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no upload" },
      { status: 400 }
    );
  }
}
