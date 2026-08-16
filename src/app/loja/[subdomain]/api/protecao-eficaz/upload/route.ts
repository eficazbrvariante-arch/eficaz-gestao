import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getStoreBySubdomain } from "@/modules/catalog/tenant-resolver";
import { getCustomerSession } from "@/modules/customers/customer-session";

/**
 * Upload da foto da nota física, pro cadastro de Proteção Eficaz em `/conta`.
 * Vive DENTRO de `/loja/[subdomain]/...` de propósito, não em `/api/...`: o
 * cookie de sessão do cliente é restrito a esse prefixo quando a loja é
 * acessada sem subdomínio próprio, direto pelo host da aplicação (ver
 * `cookiePathForStore` em `customer-session.ts`) — uma rota fora desse
 * prefixo nunca receberia o cookie nesse cenário. `subdomain` vem dos
 * próprios params da rota, nunca de `clientPayload` (sempre bate com a URL
 * que o navegador realmente chamou).
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
        if (!session) throw new Error("Faça login para enviar a foto.");

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
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
