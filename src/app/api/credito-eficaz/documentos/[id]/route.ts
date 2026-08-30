import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canViewCreditoEficazDocuments } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Única forma de ler um documento/selfie de Crédito Eficaz — nunca uma URL
 * pública do Blob. Autenticada (`requireUser`) e restrita a
 * `canViewCreditoEficazDocuments` (ADMIN só, princípio do menor privilégio:
 * colaborador de balcão nunca chega aqui). Confere `tenantId` antes de ler
 * o blob — nunca serve documento de outro tenant, mesmo com o `id` certo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (!canViewCreditoEficazDocuments(user.role)) {
    return NextResponse.json({ error: "Sem permissão para ver este documento." }, { status: 403 });
  }

  const { id } = await params;
  const document = await prisma.creditoEficazDocument.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { blobPathname: true },
  });
  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const result = await get(document.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Documento não encontrado no armazenamento." }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
