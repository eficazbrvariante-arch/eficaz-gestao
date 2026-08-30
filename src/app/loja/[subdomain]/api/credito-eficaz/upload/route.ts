import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";

/**
 * Upload de documento/selfie da solicitação de Crédito Eficaz — sempre
 * `access: 'private'` (decidido pelo componente cliente, não aqui; ver
 * `PrivateDocumentUploadField`/`SelfieCaptureField`). Vive DENTRO de
 * `/loja/[subdomain]/...` de propósito, mesmo motivo de
 * `protecao-eficaz/upload`: o cookie de sessão do cliente é restrito a esse
 * prefixo quando a loja é acessada sem subdomínio próprio.
 *
 * Só emite o token — o arquivo nunca passa pelo servidor Next, vai direto
 * do navegador pro Blob. Vincular o pathname resultante a uma
 * `CreditoEficazApplication` acontece depois, numa server action
 * (`addApplicationDocument`), nunca aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ subdomain: string }> }
): Promise<NextResponse> {
  const { subdomain } = await params;
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const store = await getStoreBySubdomain(subdomain);
        if (!store) throw new Error("Loja não encontrada.");
        const session = await getCustomerSession(store.id);
        if (!session) throw new Error("Faça login para enviar o documento.");

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha no upload" },
      { status: 400 }
    );
  }
}
